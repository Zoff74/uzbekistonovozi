//src\app\api\videos\stream\[fileId]\route.ts
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";

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

        // 1. Запрашиваем информацию о файле у Telegram API
        const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
        const data = await response.json();

        if (!data || !data.ok || !data.result || !data.result.file_path) {
            return NextResponse.json({ error: "Видеофайл не найден в Telegram" }, { status: 404 });
        }

        const filePath = data.result.file_path;
        const fileSize = data.result.file_size || 0;
        
        // Альтернативный эндпоинт для скачивания файлов (поддерживает до 50-70+ Мб без жесткого сброса по сравнению с file/bot)
        const fileDownloadUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;

        const rangeHeader = request.headers.get("range");
        const fetchHeaders: HeadersInit = {};
        
        // Проксируем Range-запросы для перемотки видео в плеере
        if (rangeHeader) {
            fetchHeaders["Range"] = rangeHeader;
        }

        const telegramRes = await fetch(fileDownloadUrl, {
            headers: fetchHeaders,
            cache: "no-store",
        });

        // Если Telegram всё же заартачился отдавать файл напрямую, возвращаем понятную ошибку
        if (!telegramRes.ok && telegramRes.status !== 206) {
            console.error(`⚠️ Telegram отказался отдать файл размером ${(fileSize / 1024 / 1024).toFixed(2)}MB. Статус: ${telegramRes.status}`);
            return NextResponse.json({ 
                error: "Telegram ограничивает прямую отдачу файлов >20Мб без локального сервера API" 
            }, { status: telegramRes.status });
        }

        const responseHeaders = new Headers();
        responseHeaders.set("Content-Type", "video/mp4");
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
        console.error("Ошибка стриминга видео:", error?.message || error);
        return NextResponse.json({ error: "Ошибка сервера при стриминге видео" }, { status: 500 });
    }
}