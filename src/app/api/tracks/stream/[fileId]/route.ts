//src\app\api\tracks\stream\[fileId]\route.ts
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
            return NextResponse.json({ error: "Невалидный fileId" }, { status: 400 });
        }

        await dbConnect();
        
        // Ищем трек в базе по audioFileId, audioUrl или _id
        const track = await (Track as any).findOne({
            $or: [
                { audioFileId: fileId },
                { audioUrl: { $regex: fileId } },
                { _id: fileId.match(/^[0-9a-fA-F]{24}$/) ? fileId : null }
            ]
        }).lean();

        let fileDownloadUrl = "";

        if (track && track.audioUrl && !track.audioUrl.includes("t.me/c/")) {
            fileDownloadUrl = track.audioUrl;
        } else if (fileId.startsWith("http://") || fileId.startsWith("https://")) {
            fileDownloadUrl = fileId;
        } else if (BOT_TOKEN) {
            // Берем fileId из базы (audioFileId) или переданный параметр
            const targetFileId = track?.audioFileId || fileId;
            try {
                const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${targetFileId}`);
                const tgData = await tgRes.json();
                if (tgData?.ok?.result?.file_path) {
                    fileDownloadUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${tgData.result.file_path}`;
                }
            } catch (e) {
                console.error("Telegram API error:", e);
            }
        }

        if (!fileDownloadUrl) {
            return NextResponse.json({ error: "Аудиофайл не найден" }, { status: 404 });
        }

        // Если это прямая внешняя ссылка или URL телеграма — проксируем потоком без падений
        const upstreamRes = await fetch(fileDownloadUrl, { cache: "no-store" });
        if (!upstreamRes.ok || !upstreamRes.body) {
            return NextResponse.json({ error: "Ошибка получения файла из хранилища" }, { status: 502 });
        }

        const responseHeaders = new Headers();
        responseHeaders.set("Content-Type", "audio/mpeg");
        responseHeaders.set("Accept-Ranges", "bytes");

        const contentLength = upstreamRes.headers.get("content-length");
        if (contentLength) {
            responseHeaders.set("Content-Length", contentLength);
        }

        return new NextResponse(upstreamRes.body, {
            status: upstreamRes.status,
            headers: responseHeaders,
        });

    } catch (error: any) {
        console.error("Audio stream error:", error);
        return NextResponse.json({ error: "Ошибка сервера при стриминге аудио" }, { status: 500 });
    }
}