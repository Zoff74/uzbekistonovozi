export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongoose";
import { Track } from "@/models/Track";
import { Types } from "mongoose";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ fileId: string }> }
) {
    try {
        const { fileId } = await params;
        console.log(`[STREAM DEBUG] Запрос трека/файла: "${fileId}"`);

        if (!fileId || fileId === "undefined" || fileId === "null") {
            return NextResponse.json({ error: "Невалидный fileId" }, { status: 400 });
        }

        await dbConnect();

        let track = null;
        if (Types.ObjectId.isValid(fileId)) {
            track = await (Track as any).findById(fileId).lean();
        }
        
        if (!track) {
            track = await (Track as any).findOne({
                $or: [
                    { audioFileId: fileId },
                    { audioUrl: fileId }
                ]
            }).lean();
        }

        console.log(`[STREAM DEBUG] Найден трек в БД:`, track ? { id: track._id, audioUrl: track.audioUrl, audioFileId: track.audioFileId } : "НЕ НАЙДЕН");

        let fileDownloadUrl = "";
        let resolvedFileId = track?.audioFileId || "";

        const rawUrl = track?.audioUrl || (fileId.includes("t.me/c/") ? fileId : "");

        // Если нет fileId, но есть ссылка t.me/c/...
        if (!resolvedFileId && rawUrl && rawUrl.includes("t.me/c/") && BOT_TOKEN) {
            try {
                const match = rawUrl.match(/\/c\/(\d+)\/(\d+)/);
                if (match) {
                    const chatId = `-100${match[1]}`;
                    const messageId = Number(match[2]);
                    console.log(`[STREAM DEBUG] Пробуем forwardMessage для chatId: ${chatId}, messageId: ${messageId}`);

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
                    console.log(`[STREAM DEBUG] Ответ Telegram forwardMessage:`, JSON.stringify(forwardData));

                    const msg = forwardData?.result;
                    const mediaObj = msg?.audio || msg?.document || msg?.voice;

                    if (mediaObj?.file_id) {
                        resolvedFileId = mediaObj.file_id;
                        console.log(`[STREAM DEBUG] Успешно получен file_id из пересылки: ${resolvedFileId}`);
                    }
                }
            } catch (err) {
                console.error("[STREAM ERROR] Ошибка при парсинге t.me/c/ через forwardMessage:", err);
            }
        }

        // Получаем прямую ссылку через getFile
        if (resolvedFileId && BOT_TOKEN) {
            try {
                console.log(`[STREAM DEBUG] Запрос getFile для file_id: ${resolvedFileId}`);
                const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${resolvedFileId}`);
                const tgData = await tgRes.json();
                console.log(`[STREAM DEBUG] Ответ Telegram getFile:`, JSON.stringify(tgData));

                if (tgData?.ok?.result?.file_path) {
                    fileDownloadUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${tgData.result.file_path}`;
                }
            } catch (e) {
                console.error("[STREAM ERROR] Ошибка Telegram getFile:", e);
            }
        }

        if (!fileDownloadUrl && track && track.audioUrl && !track.audioUrl.includes("t.me/")) {
            fileDownloadUrl = track.audioUrl;
        }

        console.log(`[STREAM DEBUG] Итоговый URL для скачивания:`, fileDownloadUrl || "НЕ СМОГЛИ ПОЛУЧИТЬ");

        if (!fileDownloadUrl) {
            return NextResponse.json({ error: "Не удалось получить файл из приватного канала" }, { status: 404 });
        }

        const upstreamRes = await fetch(fileDownloadUrl, { cache: "no-store" });
        if (!upstreamRes.ok || !upstreamRes.body) {
            console.error(`[STREAM ERROR] Ошибка upstream fetch: статус ${upstreamRes.status}`);
            return NextResponse.json({ error: "Ошибка загрузки потока из Telegram" }, { status: 502 });
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
        console.error("[STREAM CRITICAL ERROR]", error);
        return NextResponse.json({ error: "Ошибка сервера при стриминге", details: error.message }, { status: 500 });
    }
}