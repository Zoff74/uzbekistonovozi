import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import path from "path";
import os from "os";
import fs from "fs/promises";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { Readable } from "stream";

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 600;
export const runtime = 'nodejs';

const apiId = Number(process.env.TELEGRAM_API_ID || 0);
const apiHash = process.env.TELEGRAM_API_HASH || "";
const stringSession = new StringSession(process.env.TELEGRAM_STRING_SESSION || "");
const storageChatId = process.env.TELEGRAM_STORAGE_CHAT_ID || "-1004477716545";

export async function POST(request: NextRequest) {
    let inputPath = "";
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

        const tempDir = os.tmpdir();
        inputPath = path.join(tempDir, `upload_${Date.now()}_${originalName.replace(/[^a-zA-Z0-9.-]/g, "_")}`);
        
        const nodeStream = Readable.fromWeb(file.stream() as any);
        await pipeline(nodeStream, createWriteStream(inputPath));

        console.log(`🚀 Инициализация Telegram клиента для загрузки "${originalName}" (${(file.size / (1024 * 1024)).toFixed(2)} MB)...`);

        // Создаем клиент с увеличенным количеством попыток переподключения
        // Создаем клиент с принудительным использованием защищенного порта 443 (TLS) для стабильности
        client = new TelegramClient(stringSession, apiId, apiHash, {
            connectionRetries: 15,
            timeout: 120,
            useWSS: false,
        });

        await client.connect();

        // Принудительно задаем защищенную дату/порт DC, если требуется
        // @ts-ignore
        if (client.session && typeof client.session.setDC === 'function') {
            // DC 2 обычно используется по умолчанию для большинства аккаунтов (порт 443)
            client.session.setDC(2, "149.154.167.50", 443);
        }

        await client.connect();

        // Проверяем, действительно ли клиент авторизован
        if (!await client.isUserAuthorized()) {
            throw new Error("Telegram сессия не авторизована или истекла. Требуется обновить TELEGRAM_STRING_SESSION.");
        }

        console.log("📤 Соединение установлено. Начинаем загрузку файла в Telegram чат/канал...");

        const uploadedFile = await client.uploadFile({
            file: inputPath as any,
            workers: 2, // Снижаем до 2 воркеров для стабильности на Render
        });

        const resultMessage = await client.sendMessage(storageChatId, {
            file: uploadedFile,
            message: `🎥 Media: ${userName} (${originalName})`,
        });

        await fs.unlink(inputPath).catch(() => {});
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
        if (inputPath) await fs.unlink(inputPath).catch(() => {});
        if (client) {
            try { await client.disconnect(); } catch {}
        }
        console.error("🔥 MTProto Connection/Upload Error:", error);
        return NextResponse.json({ error: error.message || "Ошибка соединения с Telegram MTProto" }, { status: 500 });
    }
}