import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { CustomFile } from "telegram/client/uploads";

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 600;
export const runtime = 'nodejs';

const apiId = Number(process.env.TELEGRAM_API_ID || 0);
const apiHash = process.env.TELEGRAM_API_HASH || "";
const stringSession = new StringSession(process.env.TELEGRAM_STRING_SESSION || "");
const storageChatId = process.env.TELEGRAM_STORAGE_CHAT_ID || "-1004477716545";

export async function POST(request: NextRequest) {
    let client: TelegramClient | null = null;

    try {
        const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
        if (!token || !token.sub) {
            return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
        }

        const userName = token.name || token.sub;
        const formData = await request.formData();
        const file = formData.get("file") as File | null;

        if (!file) {
            return NextResponse.json({ error: "Файл не передан" }, { status: 400 });
        }

        const originalName = file.name || "media.mp4";
        const buffer = Buffer.from(await file.arrayBuffer());

        console.log(`🚀 Загрузка файла "${originalName}" (${(buffer.length / (1024 * 1024)).toFixed(2)} MB) через GramJS MTProto...`);

        // Подключаемся к Telegram MTProto
        client = new TelegramClient(stringSession, apiId, apiHash, { connectionRetries: 5 });
        await client.connect();

        // Превращаем буфер в CustomFile для GramJS без записи на диск
        const customFile = new CustomFile(originalName, buffer.length, "" as any, buffer as any);

        const uploadedFile = await client.uploadFile({
            file: customFile,
            workers: 4,
        });

        // Отправляем в storage-канал от имени вашего аккаунта
        const resultMessage = await client.sendMessage(storageChatId, {
            file: uploadedFile,
            message: `🎥 Media: ${userName} (${originalName})`,
        });

        await client.disconnect();

        const messageId = resultMessage.id;
        // @ts-ignore
        const fileId = resultMessage.media?.document?.id?.toString() || messageId.toString();

        return NextResponse.json({
            success: true,
            fileId: fileId,
            messageId: messageId,
            url: `/api/videos/stream/${fileId}`,
            name: originalName,
        });

    } catch (error: any) {
        if (client) await client.disconnect().catch(() => {});
        console.error("🔥 MTProto Simple Upload Error:", error);
        return NextResponse.json({ error: error.message || "Ошибка загрузки через MTProto" }, { status: 500 });
    }
}