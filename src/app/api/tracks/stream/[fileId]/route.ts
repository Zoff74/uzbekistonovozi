export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongoose";
import { Track } from "@/models/Track";
import ffmpegStatic from "ffmpeg-static";
import { spawn } from "child_process";

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
            const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
            const data = await res.json();
            if (data && data.ok && data.result && data.result.file_path) {
                fileDownloadUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${data.result.file_path}`;
            }
        }

        if (!fileDownloadUrl) {
            return NextResponse.json({ error: "Аудиофайл не найден" }, { status: 404 });
        }

        const lowerUrl = fileDownloadUrl.toLowerCase();
        const needsTranscoding = lowerUrl.endsWith(".wma") || lowerUrl.endsWith(".flac") || lowerUrl.endsWith(".aac") || lowerUrl.endsWith(".ogg") || lowerUrl.includes(".wma");

        // Если это чистый MP3 — стримим напрямую с поддержкой Range (перемотки)
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

        // --- ПРЯМОЙ ЗАПУСК FFMPEG ЧЕРЕЗ SPAWN ДЛЯ RENDER ---
        if (!ffmpegStatic) {
            return NextResponse.json({ error: "FFmpeg binary not found" }, { status: 500 });
        }

        const ffmpegProcess = spawn(ffmpegStatic, [
            "-i", fileDownloadUrl,
            "-vn",
            "-acodec", "libmp3lame",
            "-ab", "128k",
            "-f", "mp3",
            "pipe:1"
        ]);

        const webStream = new ReadableStream({
            start(controller) {
                ffmpegProcess.stdout.on("data", (chunk) => {
                    controller.enqueue(chunk);
                });
                ffmpegProcess.stdout.on("end", () => {
                    controller.close();
                });
                ffmpegProcess.on("error", (err) => {
                    controller.error(err);
                });
            },
            cancel() {
                ffmpegProcess.kill("SIGKILL");
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
        console.error("Stream error:", error?.message || error);
        return NextResponse.json({ error: "Ошибка сервера при стриминге" }, { status: 500 });
    }
}