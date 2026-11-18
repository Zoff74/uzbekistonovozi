export const dynamic = 'force-dynamic';
export const revalidate = 0;
// src/app/api/tracks/stream/[fileId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongoose";
import { Track } from "@/models/Track";
import { Types } from "mongoose";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

function getOriginalMimeType(filePath: string, telegramContentType: string | null): string {
    if (telegramContentType && telegramContentType !== "application/octet-stream") {
        return telegramContentType;
    }
    const ext = filePath.split(".").pop()?.toLowerCase();
    const mimeMap: Record<string, string> = {
        mp3: "audio/mpeg",
        m4a: "audio/mp4",
        mp4: "audio/mp4",
        aac: "audio/aac",
        ogg: "audio/ogg",
        oga: "audio/ogg",
        opus: "audio/opus",
        wav: "audio/wav",
        flac: "audio/flac",
        webm: "audio/webm",
        wma: "audio/x-ms-wma",
    };
    return (ext && mimeMap[ext]) || telegramContentType || "application/octet-stream";
}

function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ fileId: string }> | { fileId: string } }
) {
    try {
        const resolvedParams = await params;
        const fileId = resolvedParams?.fileId;

        if (!fileId || fileId === "undefined" || fileId === "null") {
            return NextResponse.json({ error: "Невалидный fileId" }, { status: 400 });
        }

        if (!BOT_TOKEN) {
            return NextResponse.json({ error: "Ошибка конфигурации бота" }, { status: 500 });
        }

        await dbConnect();

        // 1. Ищем трек в базе
        let track = null;
        if (Types.ObjectId.isValid(fileId)) {
            track = await (Track as any).findById(fileId).lean();
        }
        
        if (!track) {
            const safePattern = escapeRegex(fileId);
            track = await (Track as any).findOne({
                $or: [
                    { audioFileId: fileId },
                    { audioUrl: { $regex: safePattern } }
                ]
            }).lean();
        }

        if (!track) {
            return NextResponse.json({ error: "Трек не найден в базе данных" }, { status: 404 });
        }

        // 2. Определяем настоящий Telegram file_id
        let targetFileId = "";
        if (track.audioFileId && track.audioFileId.length > 10 && !track.audioFileId.startsWith("/")) {
            targetFileId = track.audioFileId;
        } else {
            const rawUrl = track.audioUrl || "";
            if (rawUrl.includes("/api/videos/stream/")) {
                targetFileId = rawUrl.split("/api/videos/stream/")[1];
            } else if (rawUrl.includes("/api/tracks/stream/")) {
                targetFileId = rawUrl.split("/api/tracks/stream/")[1];
            } else if (!rawUrl.startsWith("http") && !rawUrl.startsWith("/")) {
                targetFileId = rawUrl;
            }
        }

        if (!targetFileId && fileId.length > 20 && !fileId.includes("/")) {
            targetFileId = fileId;
        }

        if (!targetFileId || targetFileId.length < 10) {
            return NextResponse.json({ error: "Не удалось определить Telegram file_id трека" }, { status: 404 });
        }

        // 3. Запрашиваем путь файла у Telegram API
        const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${targetFileId}`, {
            cache: "no-store",
        });
        const tgData = await tgRes.json();

        if (!tgData?.ok || !tgData?.result?.file_path) {
            return NextResponse.json({ error: "Аудиофайл не найден в Telegram" }, { status: 404 });
        }

        const filePath: string = tgData.result.file_path;
        const fileDownloadUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;
        const isWma = filePath.toLowerCase().endsWith(".wma") || fileId.toLowerCase().includes(".wma");

        // 4. Проксируем запрос к Telegram с сохранением исходного формата и корректным Range
        const rangeHeader = request.headers.get("range");
        const fetchHeaders: HeadersInit = {};
        
        if (rangeHeader && !isWma) {
            fetchHeaders["Range"] = rangeHeader;
        }

        const telegramRes = await fetch(fileDownloadUrl, {
            headers: fetchHeaders,
            cache: "no-store",
        });

        if (!telegramRes.ok && telegramRes.status !== 206) {
            return NextResponse.json({ error: "Не удалось получить аудиопоток из Telegram" }, { status: telegramRes.status });
        }

        const responseHeaders = new Headers();
        responseHeaders.set(
            "Content-Type",
            getOriginalMimeType(filePath, telegramRes.headers.get("content-type"))
        );
        responseHeaders.set("Accept-Ranges", "bytes");
        responseHeaders.set("Cache-Control", "no-store");

        const contentLength = telegramRes.headers.get("content-length");
        if (contentLength) {
            responseHeaders.set("Content-Length", contentLength);
        }

        const contentRange = telegramRes.headers.get("content-range");
        const isPartial = telegramRes.status === 206 && Boolean(contentRange) && !isWma;

        if (isPartial && contentRange) {
            responseHeaders.set("Content-Range", contentRange);
        }

        return new NextResponse(telegramRes.body, {
            status: isPartial ? 206 : 200,
            headers: responseHeaders,
        });

    } catch (error: any) {
        console.error("Ошибка стриминга аудио:", error?.message || error);
        return NextResponse.json({ error: "Ошибка сервера при стриминге аудио" }, { status: 500 });
    }
}