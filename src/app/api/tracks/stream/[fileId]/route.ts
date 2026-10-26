export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongoose";
import { Track } from "@/models/Track";
import { Types } from "mongoose";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

export async function GET(
    request: NextRequest,
    { params }: { params: { fileId: string } }
) {
    const logPrefix = "[STREAM LOG]";
    try {
        console.log(`${logPrefix} === НОВЫЙ ЗАПРОС СТРИМА ===`);
        const fileId = params?.fileId;
        console.log(`${logPrefix} Параметр fileId из URL:`, fileId);

        if (!fileId || fileId === "undefined" || fileId === "null") {
            console.error(`${logPrefix} ОШИБКА: Невалидный fileId`);
            return NextResponse.json({ error: "Невалидный fileId" }, { status: 400 });
        }

        if (!BOT_TOKEN) {
            console.error(`${logPrefix} ОШИБКА: TELEGRAM_BOT_TOKEN не задан в .env`);
            return NextResponse.json({ error: "Ошибка конфигурации бота" }, { status: 500 });
        }

        await dbConnect();
        console.log(`${logPrefix} БД подключена успешно`);

        // 1. Ищем трек в базе
        let track = null;
        if (Types.ObjectId.isValid(fileId)) {
            track = await (Track as any).findById(fileId).lean();
            console.log(`${logPrefix} Поиск по ObjectId (${fileId}):`, track ? "НАЙДЕН" : "НЕ НАЙДЕН");
        }
        
        if (!track) {
            track = await (Track as any).findOne({
                $or: [
                    { audioFileId: fileId },
                    { audioUrl: { $regex: fileId } }
                ]
            }).lean();
            console.log(`${logPrefix} Поиск по audioFileId/audioUrl (${fileId}):`, track ? "НАЙДЕН" : "НЕ НАЙДЕН");
        }

        if (!track) {
            console.error(`${logPrefix} ОШИБКА: Трек с идентификатором ${fileId} вообще отсутствует в MongoDB`);
            return NextResponse.json({ error: "Трек не найден в базе данных" }, { status: 404 });
        }

        console.log(`${logPrefix} Данные найденного трека:`, {
            id: track._id.toString(),
            title: track.title,
            audioFileId: track.audioFileId,
            audioUrl: track.audioUrl
        });

        // 2. Определяем настоящий Telegram file_id
        let targetFileId = "";
        if (track.audioFileId && track.audioFileId.length > 10 && !track.audioFileId.startsWith("/")) {
            targetFileId = track.audioFileId;
            console.log(`${logPrefix} targetFileId взят из поля audioFileId:`, targetFileId);
        } else {
            const rawUrl = track.audioUrl || "";
            if (rawUrl.includes("/api/videos/stream/")) {
                targetFileId = rawUrl.split("/api/videos/stream/")[1];
                console.log(`${logPrefix} targetFileId извлечен из video/stream URL:`, targetFileId);
            } else if (rawUrl.includes("/api/tracks/stream/")) {
                targetFileId = rawUrl.split("/api/tracks/stream/")[1];
                console.log(`${logPrefix} targetFileId извлечен из track/stream URL:`, targetFileId);
            } else if (!rawUrl.startsWith("http") && !rawUrl.startsWith("/")) {
                targetFileId = rawUrl;
                console.log(`${logPrefix} targetFileId взят напрямую из rawUrl:`, targetFileId);
            }
        }

        if (!targetFileId && fileId.length > 20 && !fileId.includes("/")) {
            targetFileId = fileId;
            console.log(`${logPrefix} targetFileId взят из параметров URL:`, targetFileId);
        }

        console.log(`${logPrefix} Итоговый targetFileId для Telegram:`, targetFileId);

        if (!targetFileId || targetFileId.length < 10) {
            console.error(`${logPrefix} ОШИБКА: Не удалось определить валидный Telegram file_id`);
            return NextResponse.json({ error: "Не удалось определить Telegram file_id трека" }, { status: 404 });
        }

        // 3. Запрашиваем путь файла у Telegram API
        const tgApiUrl = `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${targetFileId}`;
        console.log(`${logPrefix} Запрос к Telegram API:`, tgApiUrl);
        
        const tgRes = await fetch(tgApiUrl);
        const tgData = await tgRes.json();
        console.log(`${logPrefix} Ответ Telegram getFile:`, JSON.stringify(tgData));

        if (!tgData?.ok || !tgData?.result?.file_path) {
            console.error(`${logPrefix} ОШИБКА Telegram: Файл не найден или неверный file_id`);
            return NextResponse.json({ error: "Аудиофайл не найден или удален из Telegram" }, { status: 404 });
        }

        const fileDownloadUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${tgData.result.file_path}`;
        console.log(`${logPrefix} Прямая ссылка на Telegram получена. Делаем редирект 302 на:`, fileDownloadUrl);

        // 4. РЕДИРЕКТ НАПРЯМУЮ (Обходит лимиты Render и отдает все 7.5 МБ без обрывов)
        return NextResponse.redirect(fileDownloadUrl, { status: 302 });

    } catch (error: any) {
        console.error(`${logPrefix} КРИТИЧЕСКАЯ ОШИБКА СТРИМИНГА:`, error?.message || error, error?.stack);
        return NextResponse.json({ error: "Ошибка сервера при стриминге аудио" }, { status: 500 });
    }
}