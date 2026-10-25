export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongoose";
import { Track } from "@/models/Track";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import { PassThrough } from "stream";

// Указываем fluent-ffmpeg путь к статическому бинарнику из node_modules
if (ffmpegStatic) {
    ffmpeg.setFfmpegPath(ffmpegStatic);
}

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ fileId: string }> }
) {
    try {
        const { fileId } = await params;

        if (!fileId || fileId === "undefined" || fileId === "null") {
            return NextResponse.json({ error: "Не указан или невалидный fileId" }, { status: 400 });
        }

        if (!BOT_TOKEN) {
            return NextResponse.json({ error: "Ошибка конфигурации бота" }, { status: 500 });
        }

        await dbConnect();
        const track = await (Track as any).findOne({
            $or: [
                { audioFileId: fileId },
                { audioUrl: { $regex: fileId } }
            ]
        }).lean();

        const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
        const data = await response.json();

        if (!data || !data.ok || !data.result || !data.result.file_path) {
            return NextResponse.json({ error: "Аудиофайл удален из хранилища Telegram" }, { status: 404 });
        }

        const filePath = data.result.file_path;
        const fileDownloadUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;

        const lowerPath = filePath.toLowerCase();
        const needsTranscoding = lowerPath.endsWith(".wma") || lowerPath.endsWith(".flac") || lowerPath.endsWith(".aac") || lowerPath.endsWith(".ogg");

        // Если это чистый MP3 — отдаем напрямую с Range-запросами
        if (!needsTranscoding && lowerPath.endsWith(".mp3")) {
            const rangeHeader = request.headers.get("range");
            const fetchHeaders: HeadersInit = {};
            if (rangeHeader) fetchHeaders["Range"] = rangeHeader;

            const telegramRes = await fetch(fileDownloadUrl, { headers: fetchHeaders, cache: "no-store" });
            
            const responseHeaders = new Headers();
            responseHeaders.set("Content-Type", "audio/mpeg");
            responseHeaders.set("Accept-Ranges", "bytes");
            
            const contentLength = telegramRes.headers.get("content-length");
            if (contentLength) responseHeaders.set("Content-Length", contentLength);

            const contentRange = telegramRes.headers.get("content-range");
            if (contentRange) responseHeaders.set("Content-Range", contentRange);

            return new NextResponse(telegramRes.body, {
                status: rangeHeader && telegramRes.status === 200 ? 206 : telegramRes.status,
                headers: responseHeaders,
            });
        }

        // --- ТРАНСКОДИРОВАНИЕ WMA -> MP3 НА ЛЕТУ ЧЕРЕЗ СТАТИЧЕСКИЙ FFMPEG ---
        const passThroughStream = new PassThrough();

        ffmpeg(fileDownloadUrl)
            .noVideo()
            .audioCodec("libmp3lame")
            .audioBitrate("128k")
            .format("mp3")
            .on("error", (err) => {
                console.error("FFmpeg transcoding error on Render:", err);
                try { passThroughStream.destroy(err); } catch {}
            })
            .writeToStream(passThroughStream);

        const webStream = new ReadableStream({
            start(controller) {
                passThroughStream.on("data", (chunk) => controller.enqueue(chunk));
                passThroughStream.on("end", () => controller.close());
                passThroughStream.on("error", (err) => controller.error(err));
            },
            cancel() {
                passThroughStream.destroy();
            }
        });

        const responseHeaders = new Headers();
        responseHeaders.set("Content-Type", "audio/mpeg");
        responseHeaders.set("Cache-Control", "no-cache");

        return new NextResponse(webStream, {
            status: 200,
            headers: responseHeaders,
        });

    } catch (error: any) {
        console.error("Ошибка стриминга и транскодирования на Render:", error?.message || error);
        return NextResponse.json({ error: "Ошибка сервера при транскодировании аудио" }, { status: 500 });
    }
}