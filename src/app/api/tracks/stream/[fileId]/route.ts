export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongoose";
import { Track } from "@/models/Track";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import { PassThrough } from "stream";

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

        await dbConnect();
        // Ищем трек в базе по fileId или audioUrl
        const track = await (Track as any).findOne({
            $or: [
                { audioFileId: fileId },
                { audioUrl: { $regex: fileId } },
                { _id: fileId.match(/^[0-9a-fA-F]{24}$/) ? fileId : null }
            ]
        }).lean();

        let fileDownloadUrl = "";

        if (track && track.audioUrl) {
            fileDownloadUrl = track.audioUrl;
        } else if (fileId.startsWith("http://") || fileId.startsWith("https://")) {
            fileDownloadUrl = fileId;
        } else {
            // Если это действительно Telegram file_id, запрашиваем путь через getFile
            const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
            const data = await res.json();
            if (data && data.ok && data.result && data.result.file_path) {
                fileDownloadUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${data.result.file_path}`;
            }
        }

        if (!fileDownloadUrl) {
            return NextResponse.json({ error: "Аудиофайл не найден в базе или Telegram" }, { status: 404 });
        }

        const lowerUrl = fileDownloadUrl.toLowerCase();
        const needsTranscoding = lowerUrl.endsWith(".wma") || lowerUrl.endsWith(".flac") || lowerUrl.endsWith(".aac") || lowerUrl.endsWith(".ogg") || lowerUrl.includes(".wma");

        // Если это обычный MP3 и не требуется конвертация — отдаем напрямую с поддержкой перемотки
        if (!needsTranscoding && (lowerUrl.endsWith(".mp3") || lowerUrl.endsWith(".mp4"))) {
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

        // --- КОНВЕРТАЦИЯ WMA / НЕСТАНДАРТНЫХ ФОРМАТОВ В MP3 НА ЛЕТУ ---
        const passThroughStream = new PassThrough();

        ffmpeg(fileDownloadUrl)
            .noVideo()
            .audioCodec("libmp3lame")
            .audioBitrate("128k")
            .format("mp3")
            .on("error", (err) => {
                console.error("FFmpeg error:", err.message);
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
        console.error("Stream critical error:", error?.message || error);
        return NextResponse.json({ error: "Ошибка сервера при стриминге" }, { status: 500 });
    }
}