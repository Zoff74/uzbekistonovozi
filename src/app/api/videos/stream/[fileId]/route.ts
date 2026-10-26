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

        const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
        const data = await response.json();

        if (!data || !data.ok || !data.result || !data.result.file_path) {
            return NextResponse.json({ error: "Видеофайл удален из хранилища Telegram" }, { status: 404 });
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
            return NextResponse.json({ error: "Не удалось получить видеопоток" }, { status: telegramRes.status });
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