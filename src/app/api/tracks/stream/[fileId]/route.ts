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
        const fileId = params?.fileId;
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
            track = await (Track as any).findOne({
                $or: [
                    { audioFileId: fileId },
                    { audioUrl: { $regex: fileId } }
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
        const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${targetFileId}`);
        const tgData = await tgRes.json();

        if (!tgData?.ok || !tgData?.result?.file_path) {
            return NextResponse.json({ error: "Аудиофайл не найден в Telegram" }, { status: 404 });
        }

        const fileDownloadUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${tgData.result.file_path}`;

        // 4. Проксируем запрос к Telegram, но управляем Range-заголовками,
        // чтобы экзотические форматы (.wma и др.) не ломали сессию капризными кусками.
        const rangeHeader = request.headers.get("range");
        const fetchHeaders: HeadersInit = {};
        
        // Если браузер запрашивает диапазон, передаем его, но если файл проблемный, 
        // мы можем отдать его целиком (без Range), чтобы браузер нормально его проглотил.
        if (rangeHeader && !fileId.includes(".wma")) {
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
        
        // Принудительно задаем универсальный тип, чтобы браузер не ругался на контейнер
        responseHeaders.set("Content-Type", "audio/mpeg");
        responseHeaders.set("Accept-Ranges", "bytes");

        const contentLength = telegramRes.headers.get("content-length");
        if (contentLength) responseHeaders.set("Content-Length", contentLength);

        const contentRange = telegramRes.headers.get("content-range");
        if (contentRange && !fileId.includes(".wma")) {
            responseHeaders.set("Content-Range", contentRange);
        }

        const status = rangeHeader && telegramRes.status === 200 && !fileId.includes(".wma") ? 206 : telegramRes.status;

        return new NextResponse(telegramRes.body, {
            status: status === 206 ? 206 : 200,
            headers: responseHeaders,
        });

    } catch (error: any) {
        console.error("Ошибка стриминга аудио:", error?.message || error);
        return NextResponse.json({ error: "Ошибка сервера при стриминге аудио" }, { status: 500 });
    }
}