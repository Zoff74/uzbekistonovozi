export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongoose";
import { Track } from "@/models/Track";
import { Types } from "mongoose";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

export async function GET(
    request: NextRequest,
    { params }: { params: { fileId: string } }
) {
    try {
        const fileId = params?.fileId;
        console.log(`[STREAM] Запрос трека/файла: "${fileId}"`);

        if (!fileId || fileId === "undefined" || fileId === "null") {
            return NextResponse.json({ error: "Невалидный fileId" }, { status: 400 });
        }

        await dbConnect();

        let track = null;
        if (Types.ObjectId.isValid(fileId)) {
            track = await (Track as any).findById(fileId);
        }
        
        if (!track) {
            track = await (Track as any).findOne({
                $or: [
                    { audioFileId: fileId },
                    { audioUrl: fileId }
                ]
            });
        }

        let fileDownloadUrl = "";
        let resolvedFileId = track?.audioFileId || "";

        // Если audioFileId нет, но в базе записана ссылка на приватный канал t.me/c/...
        const rawUrl = track?.audioUrl || (fileId.includes("t.me/c/") ? fileId : "");

        if (!resolvedFileId && rawUrl && rawUrl.includes("t.me/c/") && BOT_TOKEN) {
            try {
                const match = rawUrl.match(/\/c\/(\d+)\/(\d+)/);
                if (match) {
                    const chatId = `-100${match[1]}`;
                    const messageId = Number(match[2]);

                    console.log(`[STREAM] Парсим приватную ссылку Telegram -> чат: ${chatId}, сообщение: ${messageId}`);

                    const forwardRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/forwardMessage`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            chat_id: chatId,
                            from_chat_id: chatId,
                            message_id: messageId
                        })
                    });

                    const forwardData = await forwardRes.json();
                    const msg = forwardData?.result;
                    const mediaObj = msg?.audio || msg?.document || msg?.voice;

                    if (mediaObj?.file_id) {
                        resolvedFileId = mediaObj.file_id;
                        console.log(`[STREAM] Успешно получен file_id: ${resolvedFileId}`);

                        // Сохраняем найденный file_id в базу, чтобы больше не парсить ссылку при следующих проигрываниях
                        if (track && !track.audioFileId) {
                            track.audioFileId = resolvedFileId;
                            await track.save();
                        }
                    } else {
                        console.error("[STREAM] Не удалось извлечь media file_id из forwardMessage:", forwardData);
                    }
                }
            } catch (err) {
                console.error("[STREAM] Ошибка обработки t.me/c/:", err);
            }
        }

        // Запрашиваем временную прямую ссылку на файл через Telegram getFile
        if (resolvedFileId && BOT_TOKEN) {
            try {
                const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${resolvedFileId}`);
                const tgData = await tgRes.json();
                if (tgData?.ok?.result?.file_path) {
                    fileDownloadUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${tgData.result.file_path}`;
                }
            } catch (e) {
                console.error("[STREAM] Ошибка getFile:", e);
            }
        }

        // Запасной вариант для обычных внешних ссылок (не Telegram)
        if (!fileDownloadUrl && track?.audioUrl && !track.audioUrl.includes("t.me/")) {
            fileDownloadUrl = track.audioUrl;
        }

        if (!fileDownloadUrl) {
            console.error(`[STREAM] Не удалось получить аудиофайл для ID: ${fileId}`);
            return NextResponse.json({ error: "Аудиофайл не найден или нет доступа к каналу" }, { status: 404 });
        }

        const upstreamRes = await fetch(fileDownloadUrl, { cache: "no-store" });
        if (!upstreamRes.ok || !upstreamRes.body) {
            return NextResponse.json({ error: "Ошибка загрузки файла из Telegram" }, { status: 502 });
        }

        const responseHeaders = new Headers();
        responseHeaders.set("Content-Type", "audio/mpeg");
        responseHeaders.set("Accept-Ranges", "bytes");

        const contentLength = upstreamRes.headers.get("content-length");
        if (contentLength) {
            responseHeaders.set("Content-Length", contentLength);
        }

        return new NextResponse(upstreamRes.body, {
            status: upstreamRes.status,
            headers: responseHeaders,
        });

    } catch (error: any) {
        console.error("[STREAM CRITICAL]", error);
        return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
    }
}