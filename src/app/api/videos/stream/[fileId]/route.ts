//src\app\api\videos\stream\[fileId]\route.ts
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

export async function GET(
    request: NextRequest,
    { params }: { params: { fileId: string } }
) {
    try {
        const fileId = params?.fileId;

        if (!fileId || fileId === "undefined" || fileId === "null") {
            return NextResponse.json({ error: "Не указан или невалидный fileId" }, { status: 400 });
        }

        if (!BOT_TOKEN) {
            return NextResponse.json({ error: "Ошибка конфигурации бота" }, { status: 500 });
        }

        // 1. Запрашиваем путь к файлу у официального Telegram Bot API
        const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
        const data = await response.json();

        if (!data || !data.ok || !data.result || !data.result.file_path) {
            console.error("Telegram getFile error:", data);
            return NextResponse.json({ error: "Файл не найден в Telegram" }, { status: 404 });
        }

        const filePath = data.result.file_path;
        const fileDownloadUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;

        // 2. Протягиваем заголовок Range для поддержки перемотки видео в плеере
        const rangeHeader = request.headers.get("range");
        const fetchHeaders: HeadersInit = {};
        if (rangeHeader) {
            fetchHeaders["Range"] = rangeHeader;
        }

        // 3. Запрашиваем поток данных у серверов Telegram
        const telegramRes = await fetch(fileDownloadUrl, {
            headers: fetchHeaders,
            cache: "no-store",
        });

        if (!telegramRes.ok && telegramRes.status !== 206) {
            return NextResponse.json({ error: "Не удалось получить медиапоток" }, { status: telegramRes.status });
        }

        const responseHeaders = new Headers();
        responseHeaders.set("Content-Type", telegramRes.headers.get("content-type") || "video/mp4");
        responseHeaders.set("Accept-Ranges", "bytes");

        const contentLength = telegramRes.headers.get("content-length");
        if (contentLength) responseHeaders.set("Content-Length", contentLength);

        const contentRange = telegramRes.headers.get("content-range");
        if (contentRange) responseHeaders.set("Content-Range", contentRange);

        return new NextResponse(telegramRes.body, {
            status: telegramRes.status,
            headers: responseHeaders,
        });

    } catch (error: any) {
        console.error("Ошибка стриминга видео:", error?.message || error);
        return NextResponse.json({ error: "Ошибка сервера при стриминге" }, { status: 500 });
    }
}