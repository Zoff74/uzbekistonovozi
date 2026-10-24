export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongoose";
import { Track } from "@/models/Track";
import { Video } from "@/models/Video";

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

       // 1. Проверяем в БД, является ли этот fileId аудио треком
        await dbConnect();
        const isTrack = await (Track as any).findOne({
            $or: [
                { audioFileId: fileId },
                { audioUrl: { $regex: fileId } },
                { fileUrl: { $regex: fileId } }
            ]
        }).lean();

        // Запрашиваем путь к файлу у официального Telegram Bot API
        const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
        const data = await response.json();

        if (!data || !data.ok || !data.result || !data.result.file_path) {
            console.error("Telegram getFile error:", data);
            return NextResponse.json({ error: "Файл удален из хранилища Telegram" }, { status: 404 });
        }

        const filePath = data.result.file_path;
        const fileDownloadUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;

        const rangeHeader = request.headers.get("range");
        const fetchHeaders: HeadersInit = {};
        if (rangeHeader) {
            fetchHeaders["Range"] = rangeHeader;
        }

        const telegramRes = await fetch(fileDownloadUrl, {
            headers: fetchHeaders,
            cache: "no-store",
        });

        if (!telegramRes.ok && telegramRes.status !== 206) {
            return NextResponse.json({ error: "Не удалось получить медиапоток" }, { status: telegramRes.status });
        }

        const responseHeaders = new Headers();
        
        // 2. У железно определяем Content-Type: если это трек из коллекции Track, то ВСЕГДА audio/mpeg
        let contentType = isTrack ? "audio/mpeg" : "video/mp4";
        
        // Дополнительная страховка по расширению пути Telegram
        const lowerPath = filePath.toLowerCase();
        if (lowerPath.endsWith(".wav")) contentType = "audio/wav";
        if (lowerPath.endsWith(".ogg") || lowerPath.endsWith(".oga")) contentType = "audio/ogg";
        if (lowerPath.endsWith(".m4a")) contentType = "audio/mp4";

        responseHeaders.set("Content-Type", contentType);
        responseHeaders.set("Accept-Ranges", "bytes");

        const contentLength = telegramRes.headers.get("content-length");
        if (contentLength) responseHeaders.set("Content-Length", contentLength);

        const contentRange = telegramRes.headers.get("content-range");
        if (contentRange) {
            responseHeaders.set("Content-Range", contentRange);
        }

        const status = rangeHeader && telegramRes.status === 200 ? 206 : telegramRes.status;

        return new NextResponse(telegramRes.body, {
            status: status,
            headers: responseHeaders,
        });

    } catch (error: any) {
        console.error("Ошибка стриминга медиа:", error?.message || error);
        return NextResponse.json({ error: "Ошибка сервера при стриминге" }, { status: 500 });
    }
}