export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 600;
//src/app/api/download/[type]/[id]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth.config";
import { dbConnect } from "@/lib/mongoose";
import { Video } from "@/models/Video";
import User from "@/models/User";
import mongoose, { Types } from "mongoose";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import bigInt from "big-integer";

const g = globalThis as any;

async function getDownloadTelegramClient(): Promise<TelegramClient> {
    if (g.__tgSharedVideoClient && g.__tgSharedVideoClient.connected) {
        return g.__tgSharedVideoClient;
    }

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
}

function extractMessageId(doc: any, id: string): number {
    const candidates = [doc?.telegramUrl, doc?.videoUrl, doc?.audioUrl, doc?.telegramFileId, id];
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

function sanitizeFileName(name: string): string {
    return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim() || "media_file";
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ type: string; id: string }> | { type: string; id: string } }
) {
    try {
        const resolvedParams = await params;
        const type = resolvedParams?.type;
        const id = resolvedParams?.id;

        if ((type !== "track" && type !== "video") || !id || !Types.ObjectId.isValid(id)) {
            return NextResponse.json({ success: false, message: "Некорректные параметры загрузки" }, { status: 400 });
        }

        const session = await getServerSession(authOptions);
        const userId = (session?.user as any)?.id;
        if (!userId) {
            return NextResponse.json({ success: false, message: "Требуется авторизация" }, { status: 401 });
        }

        await dbConnect();

        const currentUser = await (User as any).findById(userId).lean();
        if (!currentUser) {
            return NextResponse.json({ success: false, message: "Пользователь не найден" }, { status: 404 });
        }

        const TrackModel = mongoose.models.Track || mongoose.model("Track", new mongoose.Schema({}, { strict: false }));
        const TargetModel = type === "video" ? (Video as any) : (TrackModel as any);

        const item = await TargetModel.findById(id).lean();
        if (!item) {
            return NextResponse.json({ success: false, message: "Файл не найден" }, { status: 404 });
        }

        // Проверка прав на скачивание: админ, автор или подтвержденная покупка
        const isAdmin = currentUser.role === "admin";
        const authorId = item.authorId?._id?.toString() || item.authorId?.toString() || item.userId?.toString();
        const isAuthor = authorId === userId.toString();

        const purchasedList: any[] = type === "video"
            ? (currentUser.purchasedVideos || [])
            : (currentUser.purchasedTracks || []);
        const hasPurchased = purchasedList.some((pid: any) => pid?.toString() === id.toString());

        if (!isAdmin && !isAuthor && !hasPurchased) {
            return NextResponse.json(
                { success: false, message: "Требуется оплата для скачивания оригинала" },
                { status: 402 }
            );
        }

        const client = await getDownloadTelegramClient();
        const chatId =
            type === "video"
                ? (process.env.TELEGRAM_VIDEO_CHAT_ID || "@uzbekistonovozi_video")
                : (process.env.TELEGRAM_AUDIO_CHAT_ID || process.env.TELEGRAM_CHAT_ID || "@uzbekistonovozi");

        const entity = await client.getEntity(chatId);
        const messageIdNum = extractMessageId(item, id);

        let media: any = null;
        if (messageIdNum) {
            const messages = await client.getMessages(entity, { ids: [messageIdNum] });
            media = messages[0]?.media;
        }

        if (!media || !media.document) {
            return NextResponse.json({ success: false, message: "Оригинал файла недоступен в хранилище" }, { status: 404 });
        }

        const totalFileSize = Number(media.document.size || 0);
        const mimeType = media.document.mimeType || (type === "video" ? "video/mp4" : "audio/mpeg");
        const ext = type === "video" ? "mp4" : "mp3";
        const rawTitle = item.singer ? `${item.singer} - ${item.title}` : item.title;
        const safeFilename = `${sanitizeFileName(rawTitle)}.${ext}`;

        // Увеличиваем счетчик скачиваний
        await TargetModel.updateOne({ _id: id }, { $inc: { downloadsCount: 1 } }).catch(() => {});

        let isStreamClosed = false;
        const readableStream = new ReadableStream({
            async start(controller) {
                try {
                    const generator = client.iterDownload({
                        file: media,
                        offset: bigInt(0),
                        fileSize: bigInt(totalFileSize),
                        chunkSize: 1024 * 1024,
                        requestSize: 1024 * 1024,
                    });

                    for await (const chunk of generator) {
                        if (isStreamClosed) break;
                        controller.enqueue(new Uint8Array(Buffer.from(chunk)));
                    }

                    if (!isStreamClosed) {
                        isStreamClosed = true;
                        controller.close();
                    }
                } catch (err) {
                    if (!isStreamClosed) {
                        isStreamClosed = true;
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

        return new NextResponse(readableStream, {
            status: 200,
            headers: {
                "Content-Type": mimeType,
                "Content-Length": String(totalFileSize),
                "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(safeFilename)}`,
                "Cache-Control": "no-store",
            },
        });
    } catch (error) {
        console.error("🔥 [SECURE DOWNLOAD ERROR]:", error);
        return NextResponse.json({ success: false, message: "Ошибка при скачивании файла" }, { status: 500 });
    }
}