export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const LOCAL_API_URL = process.env.TELEGRAM_LOCAL_API_URL || "http://localhost:8081";

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
            console.error("TELEGRAM_BOT_TOKEN не задан в .env.local");
            return NextResponse.json({ error: "Ошибка конфигурации бота" }, { status: 500 });
        }

        // 1. Запрашиваем информацию о файле через локальный Docker Telegram Bot API
        const response = await fetch(`${LOCAL_API_URL}/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
        const data = await response.json();

        if (!data || !data.ok || !data.result || !data.result.file_path) {
            console.error("Ошибка получения file_path от локального API:", data);
            return NextResponse.json({ error: "Ссылка на видео не найдена в Telegram" }, { status: 404 });
        }

        const filePath = data.result.file_path;

        // 2. Формируем прямую ссылку на скачивание/стриминг с локального контейнера
        const fileDownloadLink = `${LOCAL_API_URL}/file/bot${BOT_TOKEN}/${filePath}`;

        // 3. 302 Redirect перенаправляет HTML5 <video> плеер на твой локальный Docker-сервер
        return NextResponse.redirect(fileDownloadLink, { status: 302 });
    } catch (error: any) {
        console.error("Ошибка стриминга видео из Telegram:", error?.message || error);
        return NextResponse.json(
            { error: "Видео недоступно или file_id недействителен" }, 
            { status: 404 }
        );
    }
}