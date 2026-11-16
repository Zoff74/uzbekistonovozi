export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 600;

import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongoose";
import { Video } from "@/models/Video";
import { Types } from "mongoose";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import bigInt from "big-integer";

function extractMessageId(video: any, fileId: string): number {
    const candidates = [fileId, video?.telegramUrl, video?.videoUrl, video?.telegramFileId];
    for (const candidate of candidates) {
        if (!candidate) continue;
        const str = String(candidate).trim();
        const match = str.match(/\/(\d+)(?:\/?)$/);
        if (match) {
            const num = Number(match[1]);
            if (!isNaN(num) && num > 0) return num;
        }
        if (/^\d+$/.test(str)) {
            const num = Number(str);
            if (!isNaN(num) && num > 0) return num;
        }
    }
    return 0;
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ fileId: string }> }
) {
    let client: TelegramClient | null = null;
    try {
        const { fileId } = await params;
        if (!fileId || fileId === "undefined" || fileId === "null") {
            return NextResponse.json({ error: "Невалидный fileId" }, { status: 400 });
        }

        await dbConnect();
        let video = Types.ObjectId.isValid(fileId) 
            ? await (Video as any).findById(fileId).lean() 
            : await (Video as any).findOne({
                $or: [{ telegramFileId: fileId }, { telegramUrl: fileId }, { videoUrl: fileId }]
            }).lean();

        if (!video) {
            return NextResponse.json({ error: "Видео не найдено" }, { status: 404 });
        }

        const apiId = Number(process.env.TELEGRAM_API_ID || 0);
        const apiHash = process.env.TELEGRAM_API_HASH || "";
        const stringSession = process.env.TELEGRAM_STRING_SESSION || "";
        const videoChatId = process.env.TELEGRAM_VIDEO_CHAT_ID || "@uzbekistonovozi_video";

        client = new TelegramClient(new StringSession(stringSession), apiId, apiHash, {
            connectionRetries: 3,
            useWSS: false,
            autoReconnect: true,
            noUpdates: true,
            timeout: 30000,
        } as any);
        (client as any).setLogLevel("none" as any);

        await client.connect();

        const entity = await client.getEntity(videoChatId);
        const messageIdNum = extractMessageId(video, fileId);
        let media: any = null;

        if (messageIdNum) {
            try {
                const messages = await client.getMessages(entity, { ids: [messageIdNum] });
                media = messages[0]?.media;
            } catch (err) {
                console.error(`⚠️ Ошибка получения сообщения ${messageIdNum}:`, err);
            }
        }

        if (!media || !media.document) {
            const messages = await client.getMessages(entity, { limit: 50 });
            for (const msg of messages) {
                if (msg.media && (msg.media as any).document) {
                    media = msg.media;
                    break;
                }
            }
        }

        if (!media || !media.document) {
            await client.disconnect().catch(() => {});
            return NextResponse.json({ error: "Медиафайл не найден в Telegram" }, { status: 404 });
        }

        // 🚀 Автоматическое определение размера из Telegram, если в базе пусто
        const telegramRealSize = Number(media.document.size || 0);
        let totalFileSize = Number(video?.fileSize || video?.size || telegramRealSize || (73 * 1024 * 1024));

        // Читаем Range заголовок
        const rangeHeader = request.headers.get("range");
        let start = 0;
        let end = totalFileSize - 1;

        if (rangeHeader) {
            const parts = rangeHeader.replace(/bytes=/, "").split("-");
            start = parseInt(parts[0], 10) || 0;
            if (parts[1]) {
                end = Math.min(parseInt(parts[1], 10), totalFileSize - 1);
            }
        }

        const chunkSizeToFetch = (end - start) + 1;
        const activeClient = client;

        // Прямой поток без сохранения на диск сервера
        const readableStream = new ReadableStream({
            async start(controller) {
                try {
                    const generator = activeClient.iterDownload({
                        file: media,
                        offset: bigInt(start),
                        limit: Number(chunkSizeToFetch),
                        fileSize: bigInt(totalFileSize),
                        chunkSize: 512 * 1024,
                        requestSize: 1024 * 1024,
                    });

                    for await (const chunk of generator) {
                        controller.enqueue(chunk);
                    }
                    controller.close();
                } catch (err) {
                    controller.error(err);
                } finally {
                    await activeClient.disconnect().catch(() => {});
                }
            },
            cancel() {
                activeClient.disconnect().catch(() => {});
            }
        });

        return new NextResponse(readableStream, {
            status: 206,
            headers: {
                "Content-Type": "video/mp4",
                "Accept-Ranges": "bytes",
                "Content-Length": String(chunkSizeToFetch),
                "Content-Range": `bytes ${start}-${end}/${totalFileSize}`,
            },
        });

    } catch (error: any) {
        if (client) await client.disconnect().catch(() => {});
        return NextResponse.json({ error: "Ошибка проксирования" }, { status: 500 });
    }
}