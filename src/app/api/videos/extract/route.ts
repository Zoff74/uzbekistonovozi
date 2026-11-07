import { NextResponse } from "next/server";
// src/app/api/videos/extract/route.ts

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const fileId = searchParams.get("url") || searchParams.get("fileId");

    if (!fileId) {
        return NextResponse.json({ error: "File ID is required" }, { status: 400 });
    }

    try {
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        if (!botToken) {
            return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN is not configured" }, { status: 500 });
        }

        // Запрашиваем у Telegram официальный путь файла по его file_id (работает для файлов любого размера до 2ГБ)
        const fileInfoRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId.trim()}`);
        const fileInfoData = await fileInfoRes.json();

        if (!fileInfoData.ok || !fileInfoData.result?.file_path) {
            return NextResponse.json({ 
                error: `Telegram getFile error: ${fileInfoData.description || 'Не удалось получить файл'}` 
            }, { status: 400 });
        }

        const filePath = fileInfoData.result.file_path;
        
        // Собираем вечную прямую CDN-ссылку Telegram для тега <video> на сайте
        const directCdnUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;

        return NextResponse.json({ videoUrl: directCdnUrl });

    } catch (error) {
        console.error("Ошибка извлечения видео через Bot API:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}