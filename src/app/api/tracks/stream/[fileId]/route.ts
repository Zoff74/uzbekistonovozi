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
    try {
        const fileId = params?.fileId;
        if (!fileId || fileId === "undefined" || fileId === "null") {
            return NextResponse.json({ error: "Невалидный fileId" }, { status: 400 });
        }

        if (!BOT_TOKEN) {
            return NextResponse.json({ error: "Ошибка конфигурации бота" }, { status: 500 });
        }

        await dbConnect();

        // 1. Ищем трек в базе по _id или по audioFileId
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

        // 2. Железобетонно определяем настоящий Telegram file_id
        let targetFileId = "";
        
        // Сначала проверяем прямое поле audioFileId в схеме трека
        if (track.audioFileId && track.audioFileId.length > 10 && !track.audioFileId.startsWith("/")) {
            targetFileId = track.audioFileId;
        } else {
            // Если в audioFileId пусто, вытаскиваем из audioUrl
            const rawUrl = track.audioUrl || "";
            if (rawUrl.includes("/api/videos/stream/")) {
                targetFileId = rawUrl.split("/api/videos/stream/")[1];
            } else if (rawUrl.includes("/api/tracks/stream/")) {
                targetFileId = rawUrl.split("/api/tracks/stream/")[1];
            } else if (!rawUrl.startsWith("http") && !rawUrl.startsWith("/")) {
                // Если сама ссылка и есть Telegram file_id
                targetFileId = rawUrl;
            }
        }

        // Страховка: если переданный в URL параметр (fileId) сам является длинным Telegram file_id
        if (!targetFileId && fileId.length > 20 && !fileId.includes("/")) {
            targetFileId = fileId;
        }

        if (!targetFileId || targetFileId.length < 10) {
            return NextResponse.json({ error: "Не удалось определить Telegram file_id трека" }, { status: 404 });
        }

        // 3. Запрашиваем реальный путь файла у Telegram API
        const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${targetFileId}`);
        const tgData = await tgRes.json();

        if (!tgData?.ok || !tgData?.result?.file_path) {
            console.error("Telegram getFile error:", tgData);
            return NextResponse.json({ error: "Аудиофайл не найден или удален из Telegram" }, { status: 404 });
        }

        const fileDownloadUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${tgData.result.file_path}`;

        // 4. Проксируем аудиопоток с поддержкой Range-запросов (для перемотки и стабильного воспроизведения)
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
            return NextResponse.json({ error: "Не удалось получить аудиопоток из Telegram" }, { status: telegramRes.status });
        }

        const responseHeaders = new Headers();
        responseHeaders.set("Content-Type", "audio/mpeg");
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
        console.error("Ошибка стриминга аудио:", error?.message || error);
        return NextResponse.json({ error: "Ошибка сервера при стриминге аудио" }, { status: 500 });
    }
}