export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongoose";
import { Track } from "@/models/Track";

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

        // Подключаемся к базе и проверяем, существует ли такой трек в БД
        await dbConnect();
        const isTrack = await (Track as any).findOne({
            $or: [
                { audioFileId: fileId },
                { audioUrl: { $regex: fileId } },
                { fileUrl: { $regex: fileId } }
            ]
        }).lean();

        // Запрашиваем реальный путь к файлу у Telegram Bot API
        const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
        const data = await response.json();

        if (!data || !data.ok || !data.result || !data.result.file_path) {
            console.error("Telegram getFile error:", data);
            return NextResponse.json({ error: "Файл удален из хранилища Telegram" }, { status: 404 });
        }

        const filePath = data.result.file_path;
        const fileDownloadUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;

        // Поддерживаем Range-запросы браузера для перемотки аудио
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
        
        // ЕСЛИ ЭТО ТРЕК — ВСЕГДА ОТДАЕМ audio/mpeg, чтобы браузер не выдавал ошибку формата!
        let contentType = isTrack ? "audio/mpeg" : "video/mp4";
        
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