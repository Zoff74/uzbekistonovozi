export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 600;

import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongoose";
import { Video } from "@/models/Video";
import { Types } from "mongoose";
import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions";
import bigInt from "big-integer";

if (typeof process !== "undefined" && process.setMaxListeners) {
    process.setMaxListeners(100);
}

interface CachedMediaEntry {
    media: any;
    totalFileSize: number;
    mimeType: string;
    expiresAt: number;
}

const g = globalThis as any;
if (!g.__tgVideoMediaCache) {
    g.__tgVideoMediaCache = new Map<string, CachedMediaEntry>();
}

async function getSharedTelegramClient(): Promise<TelegramClient> {
    if (g.__tgSharedVideoClient && g.__tgSharedVideoClient.connected) {
        return g.__tgSharedVideoClient;
    }

    if (g.__tgSharedVideoClientPromise) {
        return g.__tgSharedVideoClientPromise;
    }

    g.__tgSharedVideoClientPromise = (async () => {
        try {
            const apiId = Number(process.env.TELEGRAM_API_ID || 0);
            const apiHash = process.env.TELEGRAM_API_HASH || "";
            const stringSession = process.env.TELEGRAM_STRING_SESSION || "";

            const client = new TelegramClient(new StringSession(stringSession), apiId, apiHash, {
                connectionRetries: 5,
                useWSS: false,
                autoReconnect: true,
                noUpdates: true,
                timeout: 60000,
            } as any);
            (client as any).setLogLevel("none" as any);

            await client.connect();
            g.__tgSharedVideoClient = client;
            return client;
        } finally {
            g.__tgSharedVideoClientPromise = null;
        }
    })();

    return g.__tgSharedVideoClientPromise;
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

async function resolveVideoMedia(client: TelegramClient, fileId: string): Promise<CachedMediaEntry | null> {
    const mediaCache: Map<string, CachedMediaEntry> = g.__tgVideoMediaCache;
    const now = Date.now();
    const cached = mediaCache.get(fileId);
    if (cached && cached.expiresAt > now) {
        return cached;
    }

    await dbConnect();
    const video = Types.ObjectId.isValid(fileId)
        ? await (Video as any).findById(fileId).lean()
        : await (Video as any).findOne({
              $or: [{ telegramFileId: fileId }, { telegramUrl: fileId }, { videoUrl: fileId }],
          }).lean();

    if (!video) {
        return null;
    }

    const videoChatId = process.env.TELEGRAM_VIDEO_CHAT_ID || "@uzbekistonovozi_video";
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
        return null;
    }

    const totalFileSize = Number(media.document.size || 0);
    if (!totalFileSize) {
        return null;
    }

    const entry: CachedMediaEntry = {
        media,
        totalFileSize,
        mimeType: media.document.mimeType || "video/mp4",
        expiresAt: now + 10 * 60 * 1000,
    };
    mediaCache.set(fileId, entry);
    return entry;
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ fileId: string }> | { fileId: string } }
) {
    try {
        const resolvedParams = await params;
        const fileId = resolvedParams?.fileId;

        if (!fileId || fileId === "undefined" || fileId === "null") {
            return NextResponse.json({ error: "Невалидный fileId" }, { status: 400 });
        }

        const client = await getSharedTelegramClient();
        const mediaEntry = await resolveVideoMedia(client, fileId);

        if (!mediaEntry) {
            return NextResponse.json({ error: "Медиафайл не найден в Telegram" }, { status: 404 });
        }

        const { media, totalFileSize, mimeType } = mediaEntry;
        const doc = media.document;
        const dcId = Number(doc.dcId || 2);

        const location = new Api.InputDocumentFileLocation({
            id: bigInt(String(doc.id)),
            accessHash: bigInt(String(doc.accessHash)),
            fileReference: doc.fileReference,
            thumbSize: "",
        });

        const rangeHeader = request.headers.get("range");
        let start = 0;
        let end = totalFileSize - 1;

        if (rangeHeader) {
            const parts = rangeHeader.replace(/bytes=/, "").split("-");
            start = parseInt(parts[0], 10) || 0;
            if (parts[1] !== undefined && parts[1] !== "") {
                end = Math.min(parseInt(parts[1], 10), totalFileSize - 1);
            }
        }

        if (start >= totalFileSize || start > end) {
            return new NextResponse(null, {
                status: 416,
                headers: {
                    "Content-Range": `bytes */${totalFileSize}`,
                },
            });
        }

        // Мгновенный ответ на пробный запрос bytes=0-0
        if (rangeHeader && start === 0 && end === 0) {
            return new NextResponse(new Uint8Array([0]), {
                status: 206,
                headers: {
                    "Content-Type": mimeType,
                    "Accept-Ranges": "bytes",
                    "Content-Length": "1",
                    "Content-Range": `bytes 0-0/${totalFileSize}`,
                    "X-Total-Size": String(totalFileSize),
                    "Cache-Control": "no-store",
                },
            });
        }

        const chunkSizeToFetch = end - start + 1;
        const alignedOffset = Math.floor(start / 4096) * 4096;
        let bytesToSkip = start - alignedOffset;
        let bytesRemaining = chunkSizeToFetch;
        let isStreamClosed = false;

        // 1 МБ (1048576 байт — строго кратно 4096 и <= 1 МБ лимита Telegram MTProto)
        const PART_SIZE = 1024 * 1024;
        // 2 чанка в пайплайне на каждый из 4 HTTP-потоков = 8 параллельных запросов (стандарт Telegram Desktop)
        const PIPELINE_DEPTH = 2;

        const fetchPartWithRetry = async (offsetBytes: number): Promise<Buffer> => {
            let attempt = 0;
            while (true) {
                if (isStreamClosed) return Buffer.alloc(0);
                try {
                    const result: any = await client.invoke(
                        new Api.upload.GetFile({
                            location,
                            offset: bigInt(offsetBytes),
                            limit: PART_SIZE,
                            precise: true,
                        }),
                        dcId
                    );
                    return Buffer.from(result.bytes || []);
                } catch (err: any) {
                    attempt++;
                    if (isStreamClosed || attempt > 6) throw err;

                    const errMsg = String(err?.message || err?.errorMessage || "");

                    if (errMsg.includes("FILE_REFERENCE")) {
                        g.__tgVideoMediaCache.delete(fileId);
                    }

                    const floodMatch = errMsg.match(/FLOOD_WAIT_(\d+)/);
                    if (floodMatch) {
                        const waitSec = Math.min(30, Number(floodMatch[1]) || 2);
                        await new Promise((r) => setTimeout(r, waitSec * 1000));
                        continue;
                    }

                    await new Promise((r) => setTimeout(r, 300 * attempt));
                }
            }
        };

        const readableStream = new ReadableStream({
            async start(controller) {
                try {
                    let nextFetchOffset = alignedOffset;
                    const maxOffset = end + 1;
                    const inFlight: Promise<Buffer>[] = [];

                    const scheduleNext = () => {
                        while (!isStreamClosed && inFlight.length < PIPELINE_DEPTH && nextFetchOffset < maxOffset) {
                            const currentOffset = nextFetchOffset;
                            nextFetchOffset += PART_SIZE;
                            inFlight.push(fetchPartWithRetry(currentOffset));
                        }
                    };

                    scheduleNext();

                    while (inFlight.length > 0 && !isStreamClosed && bytesRemaining > 0) {
                        const currentPromise = inFlight.shift()!;
                        scheduleNext();

                        let buffer = await currentPromise;
                        if (isStreamClosed || bytesRemaining <= 0) break;
                        if (buffer.length === 0) break;

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
                    }

                    if (!isStreamClosed) {
                        isStreamClosed = true;
                        controller.close();
                    }
                } catch (err) {
                    if (!isStreamClosed) {
                        isStreamClosed = true;
                        console.error("🔥 [VIDEO STREAM CHUNK ERROR]:", err);
                        try {
                            controller.error(err);
                        } catch {}
                    }
                }
            },
            cancel() {
                isStreamClosed = true;
            },
        });

        const headers: Record<string, string> = {
            "Content-Type": mimeType,
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
        g.__tgSharedVideoClient = null;
        console.error("🔥 [STREAM ERROR]:", error);
        return NextResponse.json({ error: "Ошибка проксирования" }, { status: 500 });
    }
}