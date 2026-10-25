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
        console.log(`[STREAM] Запрос трека ID: "${fileId}"`);

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
                    { audioUrl: { $regex: fileId } }
                ]
            }).lean();
        }

        let fileDownloadUrl = "";
        let targetFileId = "";

        // 1. Проверяем, что записано в audioUrl трека (например: /api/videos/stream/BAACAgIA...)
        const rawUrl = track?.audioUrl || "";
        
        if (rawUrl.includes("/api/videos/stream/")) {
            targetFileId = rawUrl.split("/api/videos/stream/")[1];
        } else if (track?.audioFileId) {
            targetFileId = track.audioFileId;
        } else if (fileId.startsWith("B") || fileId.startsWith("C") || fileId.startsWith("A")) {
            // Если в качестве fileId передан сам телеграм ID
            targetFileId = fileId;
        }

        // 2. Если нашли Telegram file_id, запрашиваем реальный путь для скачивания у Telegram
        if (targetFileId && BOT_TOKEN) {
            try {
                const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${targetFileId}`);
                const tgData = await tgRes.json();
                if (tgData?.ok?.result?.file_path) {
                    fileDownloadUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${tgData.result.file_path}`;
                }
            } catch (e) {
                console.error("[STREAM] Ошибка getFile:", e);
            }
        }

        // Запасной вариант для внешних прямых ссылок (не Telegram)
        if (!fileDownloadUrl && rawUrl && rawUrl.startsWith("http")) {
            fileDownloadUrl = rawUrl;
        }

        if (!fileDownloadUrl) {
            console.error(`[STREAM] Не удалось получить ссылку для трека ID: ${fileId}`);
            return NextResponse.json({ error: "Аудиофайл не найден" }, { status: 404 });
        }

        const upstreamRes = await fetch(fileDownloadUrl, { cache: "no-store" });
        if (!upstreamRes.ok || !upstreamRes.body) {
            return NextResponse.json({ error: "Ошибка загрузки из хранилища Telegram" }, { status: 502 });
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
        console.error("[STREAM CRITICAL]:", error);
        return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
    }
}