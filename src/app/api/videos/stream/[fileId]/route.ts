export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 600;
//src\app\api\videos\stream\[fileId]\route.ts
import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongoose";
import { Video } from "@/models/Video";
import { Types } from "mongoose";
import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions";
import bigInt from "big-integer";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import os from "os";
import { Readable } from "stream";

if (typeof process !== "undefined" && process.setMaxListeners) process.setMaxListeners(100);

interface CachedMediaEntry { media: any; totalFileSize: number; mimeType: string; expiresAt: number; }

const g = globalThis as any;
if (!g.__tgVideoMediaCache) g.__tgVideoMediaCache = new Map<string, CachedMediaEntry>();

const STREAM_CACHE_DIR = path.join(os.tmpdir(), "uzov_video_stream_cache");
const PART_SIZE = 512 * 1024;
const PREFETCH_PARTS = 2;

function getCacheFilePath(fileId: string): string {
    return path.join(STREAM_CACHE_DIR, `${fileId.replace(/[^a-zA-Z0-9_-]/g, "_")}.bin`);
}

async function getSharedTelegramClient(): Promise<TelegramClient> {
    if (g.__tgSharedVideoClient && g.__tgSharedVideoClient.connected) return g.__tgSharedVideoClient;
    if (g.__tgSharedVideoClientPromise) return g.__tgSharedVideoClientPromise;
    g.__tgSharedVideoClientPromise = (async () => {
        try {
            const apiId = Number(process.env.TELEGRAM_API_ID || 0);
            const apiHash = process.env.TELEGRAM_API_HASH || "";
            const stringSession = process.env.TELEGRAM_STRING_SESSION || "";
            const client = new TelegramClient(new StringSession(stringSession), apiId, apiHash, { connectionRetries: 5, useWSS: false, autoReconnect: true, noUpdates: true, timeout: 30000 } as any);
            (client as any).setLogLevel("none" as any);
            await client.connect();
            g.__tgSharedVideoClient = client;
            return client;
        } finally { g.__tgSharedVideoClientPromise = null; }
    })();
    return g.__tgSharedVideoClientPromise;
}

function extractMessageId(video: any, fileId: string): number {
    for (const candidate of [fileId, video?.telegramUrl, video?.videoUrl, video?.telegramFileId]) {
        if (!candidate) continue;
        const str = String(candidate).trim();
        const match = str.match(/\/(\d+)(?:\/?)$/);
        if (match && Number(match[1]) > 0) return Number(match[1]);
        if (/^\d+$/.test(str) && Number(str) > 0) return Number(str);
    }
    return 0;
}

async function resolveVideoMedia(client: TelegramClient, fileId: string): Promise<CachedMediaEntry | null> {
    const mediaCache: Map<string, CachedMediaEntry> = g.__tgVideoMediaCache;
    const now = Date.now();
    const cached = mediaCache.get(fileId);
    if (cached && cached.expiresAt > now) return cached;

    await dbConnect();
    const video = Types.ObjectId.isValid(fileId)
        ? await (Video as any).findById(fileId).lean()
        : await (Video as any).findOne({ $or: [{ telegramFileId: fileId }, { telegramUrl: fileId }, { videoUrl: fileId }] }).lean();
    if (!video) return null;

    const entity = await client.getEntity(process.env.TELEGRAM_VIDEO_CHAT_ID || "@uzbekistonovozi_video");
    const messageIdNum = extractMessageId(video, fileId);
    let media: any = null;

    if (messageIdNum) {
        try { media = (await client.getMessages(entity, { ids: [messageIdNum] }))[0]?.media; } catch (err) { console.error(`⚠️ Ошибка получения сообщения ${messageIdNum}:`, err); }
    }
    if (!media?.document) {
        const messages = await client.getMessages(entity, { limit: 50 });
        for (const msg of messages) { if ((msg.media as any)?.document) { media = msg.media; break; } }
    }
    const totalFileSize = Number(media?.document?.size || 0);
    if (!media?.document || !totalFileSize) return null;

    const entry: CachedMediaEntry = { media, totalFileSize, mimeType: media.document.mimeType || "video/mp4", expiresAt: now + 10 * 60 * 1000 };
    mediaCache.set(fileId, entry);
    return entry;
}

function parseRange(rangeHeader: string | null, totalSize: number): { start: number; end: number } | null {
    let start = 0, end = totalSize - 1;
    if (rangeHeader) {
        const parts = rangeHeader.replace(/bytes=/, "").split("-");
        start = parseInt(parts[0], 10) || 0;
        if (parts[1] !== undefined && parts[1] !== "") end = Math.min(parseInt(parts[1], 10), totalSize - 1);
    }
    return start >= totalSize || start > end ? null : { start, end };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ fileId: string }> | { fileId: string } }) {
    try {
        const fileId = (await params)?.fileId;
        if (!fileId || fileId === "undefined" || fileId === "null") return NextResponse.json({ error: "Невалидный fileId" }, { status: 400 });

        const cacheFilePath = getCacheFilePath(fileId);
        const rangeHeader = request.headers.get("range");

        try {
            const cachedStat = await fsp.stat(cacheFilePath);
            if (cachedStat.size > 0) {
                const parsed = parseRange(rangeHeader, cachedStat.size);
                if (!parsed) return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${cachedStat.size}` } });
                const { start, end } = parsed;
                const nodeStream = fs.createReadStream(cacheFilePath, { start, end });
                const headers: Record<string, string> = { "Content-Type": "video/mp4", "Accept-Ranges": "bytes", "Content-Length": String(end - start + 1), "X-Total-Size": String(cachedStat.size), "X-Cache": "HIT", "Cache-Control": "public, max-age=3600" };
                if (rangeHeader) headers["Content-Range"] = `bytes ${start}-${end}/${cachedStat.size}`;
                return new NextResponse(Readable.toWeb(nodeStream) as ReadableStream, { status: rangeHeader ? 206 : 200, headers });
            }
        } catch {}

        const client = await getSharedTelegramClient();
        const mediaEntry = await resolveVideoMedia(client, fileId);
        if (!mediaEntry) return NextResponse.json({ error: "Медиафайл не найден в Telegram" }, { status: 404 });

        const { media, totalFileSize, mimeType } = mediaEntry;
        const parsed = parseRange(rangeHeader, totalFileSize);
        if (!parsed) return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${totalFileSize}` } });
        const { start, end } = parsed;

        if (rangeHeader && start === 0 && end === 0) {
            return new NextResponse(new Uint8Array([0]), { status: 206, headers: { "Content-Type": mimeType, "Accept-Ranges": "bytes", "Content-Length": "1", "Content-Range": `bytes 0-0/${totalFileSize}`, "X-Total-Size": String(totalFileSize), "Cache-Control": "no-store" } });
        }

        const doc = media.document;
        const dcId = Number(doc.dcId || 2);
        const location = new Api.InputDocumentFileLocation({ id: bigInt(String(doc.id)), accessHash: bigInt(String(doc.accessHash)), fileReference: doc.fileReference, thumbSize: "" });

        const isFullSequentialFromZero = !rangeHeader || (start === 0 && end >= totalFileSize - 1);
        let bgWriteStream: fs.WriteStream | null = null;
        let bgWriteFailed = false;
        let expectedSeqOffset = 0;
        const partFilePath = `${cacheFilePath}.part`;

        if (isFullSequentialFromZero) {
            await fsp.mkdir(STREAM_CACHE_DIR, { recursive: true }).catch(() => {});
            bgWriteStream = fs.createWriteStream(partFilePath, { flags: "w" });
            bgWriteStream.on("error", () => { bgWriteFailed = true; });
        }

        const chunkSizeToFetch = end - start + 1;
        const alignedOffset = Math.floor(start / 4096) * 4096;
        let bytesToSkip = start - alignedOffset;
        let bytesRemaining = chunkSizeToFetch;
        let nextFetchOffset = alignedOffset;
        const maxOffset = end + 1;
        let isStreamClosed = false;

        const fetchPartWithRetry = async (offsetBytes: number): Promise<Buffer> => {
            for (let attempt = 1; attempt <= 6; attempt++) {
                if (isStreamClosed) return Buffer.alloc(0);
                let currentClient: TelegramClient | null = null;
                try {
                    currentClient = await getSharedTelegramClient();
                    const result: any = await Promise.race([
                        currentClient.invoke(new Api.upload.GetFile({ location, offset: bigInt(offsetBytes), limit: PART_SIZE }), dcId),
                        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("TG_CHUNK_TIMEOUT")), 20000)),
                    ]);
                    return Buffer.from(result.bytes || []);
                } catch (err: any) {
                    if (isStreamClosed || attempt === 6) return Buffer.alloc(0);
                    const errMsg = String(err?.message || err?.errorMessage || "");
                    if (errMsg.includes("FILE_REFERENCE") && currentClient) {
                        g.__tgVideoMediaCache.delete(fileId);
                        const refreshed = await resolveVideoMedia(currentClient, fileId).catch(() => null);
                        if (refreshed?.media?.document) location.fileReference = refreshed.media.document.fileReference;
                    }
                    if (errMsg.includes("AUTH_KEY_UNREGISTERED") || errMsg.includes("USER_DEACTIVATED")) g.__tgSharedVideoClient = null;
                    const floodMatch = errMsg.match(/FLOOD_WAIT_(\d+)/);
                    await new Promise((r) => setTimeout(r, floodMatch ? Math.min(30, Number(floodMatch[1]) || 2) * 1000 : 400 * attempt));
                }
            }
            return Buffer.alloc(0);
        };

        const prefetched = new Map<number, Promise<Buffer>>();
        const schedulePrefetch = (fromOffset: number) => {
            for (let i = 0; i < PREFETCH_PARTS; i++) {
                const off = fromOffset + i * PART_SIZE;
                if (off >= maxOffset || prefetched.has(off)) continue;
                prefetched.set(off, fetchPartWithRetry(off));
            }
        };

        const finalizeBgCache = async (completedFullFile: boolean) => {
            if (bgWriteStream && !bgWriteStream.destroyed) bgWriteStream.end();
            if (isFullSequentialFromZero && !bgWriteFailed && completedFullFile) {
                try { const st = await fsp.stat(partFilePath); if (st.size >= totalFileSize) await fsp.rename(partFilePath, cacheFilePath); } catch {}
            } else if (isFullSequentialFromZero) {
                await fsp.unlink(partFilePath).catch(() => {});
            }
        };

        const readableStream = new ReadableStream({
            async pull(controller) {
                if (isStreamClosed) return;
                try {
                    if (bytesRemaining > 0 && nextFetchOffset < maxOffset) {
                        schedulePrefetch(nextFetchOffset);
                        const offsetToRead = nextFetchOffset;
                        nextFetchOffset += PART_SIZE;
                        const promise = prefetched.get(offsetToRead) || fetchPartWithRetry(offsetToRead);
                        prefetched.delete(offsetToRead);

                        let buffer = await promise;
                        if (isStreamClosed) return;

                        if (buffer.length === 0) {
                            const padLen = Math.min(bytesRemaining, PART_SIZE);
                            bytesRemaining -= padLen;
                            controller.enqueue(new Uint8Array(padLen));
                            return;
                        }

                        if (bgWriteStream && !bgWriteFailed && !bgWriteStream.destroyed && offsetToRead === expectedSeqOffset) {
                            bgWriteStream.write(buffer);
                            expectedSeqOffset += buffer.length;
                        }

                        if (bytesToSkip > 0) {
                            if (buffer.length <= bytesToSkip) { bytesToSkip -= buffer.length; return; }
                            buffer = buffer.subarray(bytesToSkip);
                            bytesToSkip = 0;
                        }
                        if (buffer.length > bytesRemaining) buffer = buffer.subarray(0, bytesRemaining);
                        bytesRemaining -= buffer.length;
                        controller.enqueue(new Uint8Array(buffer));
                        return;
                    }
                    if (!isStreamClosed) {
                        isStreamClosed = true;
                        await finalizeBgCache(isFullSequentialFromZero && bytesRemaining <= 0);
                        try { controller.close(); } catch {}
                    }
                } catch (err) {
                    if (!isStreamClosed) {
                        isStreamClosed = true;
                        await finalizeBgCache(false);
                        console.error("🔥 [VIDEO STREAM CHUNK ERROR]:", err);
                        try { controller.close(); } catch {}
                    }
                }
            },
            cancel() { isStreamClosed = true; void finalizeBgCache(false); },
        });

        const headers: Record<string, string> = { "Content-Type": mimeType, "Accept-Ranges": "bytes", "Content-Length": String(chunkSizeToFetch), "X-Total-Size": String(totalFileSize), "X-Cache": "MISS-BG", "Cache-Control": "no-store" };
        if (rangeHeader) headers["Content-Range"] = `bytes ${start}-${end}/${totalFileSize}`;
        return new NextResponse(readableStream, { status: rangeHeader ? 206 : 200, headers });
    } catch (error: any) {
        g.__tgSharedVideoClient = null;
        console.error("🔥 [STREAM ERROR]:", error);
        return NextResponse.json({ error: "Ошибка проксирования" }, { status: 500 });
    }
}