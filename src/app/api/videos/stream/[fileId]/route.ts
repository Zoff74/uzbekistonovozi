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

if (typeof process !== "undefined" && process.setMaxListeners) {
    process.setMaxListeners(50);
}

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
    { params }: { params: Promise<{ fileId: string }> | { fileId: string } }
) {
    let client: TelegramClient | null = null;
    try {
        const resolvedParams = await params;
        const fileId = resolvedParams?.fileId;
        console.log(`[VIDEO STREAM] Запрос для fileId: ${fileId}, Range: ${request.headers.get("range") || "нет"}`);

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
            console.warn(`[VIDEO STREAM] Видео не найдено в БД: ${fileId}`);
            return NextResponse.json({ error: "Видео не найдено" }, { status: 404 });
        }

        const apiId = Number(process.env.TELEGRAM_API_ID || 0);
        const apiHash = process.env.TELEGRAM_API_HASH || "";
        const stringSession = process.env.TELEGRAM_STRING_SESSION || "";
        const videoChatId = process.env.TELEGRAM_VIDEO_CHAT_ID || "@uzbekistonovozi_video";

        client = new TelegramClient(new StringSession(stringSession), apiId, apiHash, {
            connectionRetries: 5,
            useWSS: false,
            autoReconnect: true,
            noUpdates: true,
            timeout: 60000,
        } as any);
        (client as any).setLogLevel("none" as any);

        await client.connect();

        const entity = await client.getEntity(videoChatId);
        const messageIdNum = extractMessageId(video, fileId);
        console.log(`[VIDEO STREAM] Поиск сообщения в Telegram ID: ${messageIdNum}`);
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
            console.warn(`[VIDEO STREAM] Медиафайл не найден в Telegram для ${fileId}`);
            return NextResponse.json({ error: "Медиафайл не найден в Telegram" }, { status: 404 });
        }

        const totalFileSize = Number(media.document.size || 0);
        console.log(`[VIDEO STREAM] Реальный размер в Telegram: ${totalFileSize} байт (${(totalFileSize / 1024 / 1024).toFixed(2)} МБ)`);

        if (!totalFileSize) {
            await client.disconnect().catch(() => {});
            return NextResponse.json({ error: "Telegram не вернул размер медиафайла" }, { status: 502 });
        }

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

        if (start >= totalFileSize || start > end) {
            await client.disconnect().catch(() => {});
            return new NextResponse(null, {
                status: 416,
                headers: {
                    "Content-Range": `bytes */${totalFileSize}`,
                },
            });
        }

        const chunkSizeToFetch = (end - start) + 1;

        // Выравниваем offset вниз до ближайшего числа, кратного 4096 (требование Telegram MTProto)
        const alignedOffset = Math.floor(start / 4096) * 4096;
        let bytesToSkip = start - alignedOffset;
        let bytesRemaining = chunkSizeToFetch;

        const activeClient = client;
        let isStreamClosed = false;

        const readableStream = new ReadableStream({
            async start(controller) {
                try {
                    const generator = activeClient.iterDownload({
                        file: media,
                        offset: bigInt(alignedOffset),
                        fileSize: bigInt(totalFileSize),
                        chunkSize: 512 * 1024,
                        requestSize: 512 * 1024,
                    });

                    for await (const chunk of generator) {
                        if (isStreamClosed || bytesRemaining <= 0) break;

                        let buffer = Buffer.from(chunk);

                        if (bytesToSkip > 0) {
                            if (buffer.length <= bytesToSkip) {
                                bytesToSkip -= buffer.length;
                                continue;
                            }
                            buffer = buffer.subarray(bytesToSkip);
                            bytesToSkip = 0;
                        }

                        if (buffer.length > bytesRemaining) {
                            buffer = buffer.subarray(0, bytesRemaining);
                        }

                        if (!isStreamClosed) {
                            controller.enqueue(new Uint8Array(buffer));
                        }
                        bytesRemaining -= buffer.length;

                        if (bytesRemaining <= 0) break;
                    }
                    if (!isStreamClosed) {
                        isStreamClosed = true;
                        controller.close();
                    }
                } catch (err) {
                    if (!isStreamClosed) {
                        isStreamClosed = true;
                        console.error("🔥 [VIDEO STREAM CHUNK ERROR]:", err);
                        try { controller.error(err); } catch {}
                    }
                } finally {
                    await activeClient.disconnect().catch(() => {});
                }
            },
            cancel() {
                isStreamClosed = true;
                activeClient.disconnect().catch(() => {});
            }
        });

        const headers: Record<string, string> = {
            "Content-Type": media.document.mimeType || "video/mp4",
            "Accept-Ranges": "bytes",
            "Content-Length": String(chunkSizeToFetch),
            "X-Total-Size": String(totalFileSize),
            "Cache-Control": "no-store",
        };

        if (rangeHeader) {
            headers["Content-Range"] = `bytes ${start}-${end}/${totalFileSize}`;
            return new NextResponse(readableStream, {
                status: 206,
                headers,
            });
        }

        return new NextResponse(readableStream, {
            status: 200,
            headers,
        });

    } catch (error: any) {
        if (client) await client.disconnect().catch(() => {});
        console.error("🔥 [STREAM ERROR]:", error);
        return NextResponse.json({ error: "Ошибка проксирования" }, { status: 500 });
    }
}