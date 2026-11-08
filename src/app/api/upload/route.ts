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

// src\app\api\upload\route.ts

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
        const fileSizeMB = file.size / (1024 * 1024);

        const tempDir = os.tmpdir();
        inputPath = path.join(tempDir, `upload_${Date.now()}_${originalName.replace(/[^a-zA-Z0-9.-]/g, "_")}`);
        
        const nodeStream = Readable.fromWeb(file.stream() as any);
        await pipeline(nodeStream, createWriteStream(inputPath));

        const workersCount = fileSizeMB > 20 ? 1 : 2;

        console.log(`🚀 Инициализация Telegram MTProto для "${originalName}" (${fileSizeMB.toFixed(2)} MB) [Воркеров: ${workersCount}]...`);

        client = new TelegramClient(stringSession, apiId, apiHash, {
            connectionRetries: 10,
            timeout: 180,
        });

        // ПРИНУДИТЕЛЬНО стучимся на защищенный порт 443, обходя заблокированный порт 80
        if (client.session && typeof (client.session as any).setDC === 'function') {
            (client.session as any).setDC(2, "149.154.167.50", 443);
        }

        await client.connect();

        if (!await client.isUserAuthorized()) {
            throw new Error("Telegram сессия не авторизована или истекла.");
        }

        console.log("📤 Защищенное соединение по порту 443 установлено. Загружаем файл...");

        let lastLoggedPercent = 0;
        const uploadedFile = await client.uploadFile({
            file: inputPath as any,
            workers: workersCount, 
            callback: (progress: number) => {
                const percent = Math.floor(progress * 100);
                if (percent >= lastLoggedPercent + 20) {
                    console.log(`⏳ Прогресс загрузки: ${percent}%`);
                    lastLoggedPercent = percent;
                }
            },
        } as any);

        console.log("✅ Файл успешно загружен в Telegram! Отправляем в канал...");

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
        console.error("🔥 Upload Error:", error);
        return NextResponse.json({ error: error.message || "Ошибка загрузки в Telegram" }, { status: 500 });
    }
}