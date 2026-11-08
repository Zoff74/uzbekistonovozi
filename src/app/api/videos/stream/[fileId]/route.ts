export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 600;

process.on('unhandledRejection', (reason: any) => {
    if (reason?.message === 'TIMEOUT' || reason?.stack?.includes('updates.js')) return;
});

import { NextRequest, NextResponse } from "next/server";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";

async function getMTProtoClient() {
    const apiId = Number(process.env.TELEGRAM_API_ID || 0);
    const apiHash = process.env.TELEGRAM_API_HASH || "";
    const stringSession = process.env.TELEGRAM_STRING_SESSION || "";

    if (!apiId || !apiHash || !stringSession) {
        throw new Error("Не настроены параметры TELEGRAM_API_ID, TELEGRAM_API_HASH или TELEGRAM_STRING_SESSION");
    }

    const client = new TelegramClient(new StringSession(stringSession), apiId, apiHash, {
        connectionRetries: 3,
        useWSS: false,
        autoReconnect: false,
        noUpdates: true,
    } as any);

    await client.connect();
    return client;
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ fileId: string }> }
) {
    let client: TelegramClient | null = null;
    try {
        const { fileId } = await params;

        if (!fileId || fileId === "undefined" || fileId === "null") {
            return NextResponse.json({ error: "Не указан или невалидный fileId/messageId" }, { status: 400 });
        }

        let messageIdNum = 0;
        if (fileId.includes("t.me/")) {
            const match = fileId.match(/\/(\d+)$/);
            if (match) messageIdNum = Number(match[1]);
        } else {
            messageIdNum = Number(fileId);
        }

        if (!messageIdNum || isNaN(messageIdNum)) {
            return NextResponse.json({ error: "Неверный формат ID сообщения" }, { status: 400 });
        }

        const videoChatId = process.env.TELEGRAM_VIDEO_CHAT_ID || "@uzbekistonovozi_video";

        client = await getMTProtoClient();
        const entity = await client.getEntity(videoChatId);

        const messages = await client.getMessages(entity, {
            ids: [messageIdNum],
        });

        const message = messages[0];
        if (!message || !message.media) {
            await client.disconnect();
            return NextResponse.json({ error: "Медиафайл не найден в Telegram канале" }, { status: 404 });
        }

        const buffer = await client.downloadMedia(message, {
            outputFile: undefined,
        });

        await client.disconnect().catch(() => {});
        client = null;

        if (!buffer || !Buffer.isBuffer(buffer)) {
            return NextResponse.json({ error: "Не удалось загрузить медиа из Telegram" }, { status: 500 });
        }

        const fileSize = buffer.length;
        const rangeHeader = request.headers.get("range");
        let start = 0;
        let end = fileSize - 1;

        if (rangeHeader) {
            const parts = rangeHeader.replace(/bytes=/, "").split("-");
            start = parseInt(parts[0], 10);
            if (parts[1]) {
                end = parseInt(parts[1], 10);
            }
        }

        if (start >= fileSize) {
            return new NextResponse(null, {
                status: 416,
                headers: {
                    "Content-Range": `bytes */${fileSize}`,
                },
            });
        }

        const chunksize = (end - start) + 1;
        const slicedBuffer = buffer.subarray(start, end + 1);

        const headers = new Headers({
            "Content-Type": "video/mp4",
            "Accept-Ranges": "bytes",
            "Content-Length": String(chunksize),
            "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        });

        return new NextResponse(new Uint8Array(slicedBuffer) as any, {
            status: rangeHeader ? 206 : 200,
            headers,
        });

    } catch (error: any) {
        if (client) {
            await client.disconnect().catch(() => {});
        }
        console.error("🔥 [MTPROTO STREAM ERROR]:", error);
        return NextResponse.json({ error: error?.message || "Ошибка стриминга через MTProto" }, { status: 500 });
    }
}