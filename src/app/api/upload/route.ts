import { NextResponse, NextRequest } from "next/server";
import ImageKit from "@imagekit/nodejs";
import { getToken } from "next-auth/jwt";
import path from "path";
import os from "os";
import fs from "fs/promises";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { Blob as NodeBlob } from "buffer";

// src/app/api/upload/route.ts
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 600;
export const runtime = 'nodejs';

const imagekit = new ImageKit({
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY || "",
});

export async function POST(request: NextRequest) {
    let inputPath = "";

    try {
        const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
        if (!token || !token.sub) {
            return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
        }

        const userName = token.name || token.sub;
        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        let uploadType = (formData.get("type") as string) || request.headers.get("x-upload-type") || "";

        if (!file) {
            return NextResponse.json({ error: "Файл не передан" }, { status: 400 });
        }

        const headerName = request.headers.get("x-file-name");
        let originalName = file.name || "file";
        if (headerName) {
            try {
                originalName = decodeURIComponent(headerName);
            } catch {
                originalName = headerName;
            }
        }

        if (!uploadType) {
            if (file.type.startsWith("image/") || originalName.match(/\.(jpg|jpeg|png|webp|avif)$/i)) {
                uploadType = "avatar";
            } else if (file.type.startsWith("audio/") || originalName.match(/\.(mp3|wav|wma|flac|aac|m4a)$/i)) {
                uploadType = "audio";
            } else {
                uploadType = "video";
            }
        }

        // Загрузка изображений/обложек через ImageKit
        if (uploadType === "image" || uploadType === "cover" || uploadType === "avatar" || uploadType === "img") {
            const oldFileId = formData.get("oldFileId") as string | null;
            const buffer = Buffer.from(await file.arrayBuffer());
            const uniqueFileName = `${Date.now()}_${originalName.replace(/\s+/g, '_')}`;
            const mainFolder = process.env.NEXT_PUBLIC_IMAGEKIT_FOLDER || "";
            const defaultFolder = mainFolder ? `/${mainFolder}/covers` : "/uzbekistonovozi/covers";
            const folder = (formData.get("folder") as string) || defaultFolder;

            const uploadResponse: any = await imagekit.files.upload({
                file: buffer.toString("base64"),
                fileName: uniqueFileName,
                folder: folder,
            });

            if (oldFileId && !oldFileId.startsWith("BAACAg")) {
                try {
                    await imagekit.files.delete(oldFileId);
                } catch (err) {
                    console.error("Ошибка при удалении старого файла:", err);
                }
            }

            return NextResponse.json({
                success: true,
                fileId: uploadResponse.fileId,
                url: uploadResponse.url,
                name: uploadResponse.name,
            });
        } 

        // Обработка видео и аудио без сжатия (до 2 ГБ через стрим во временную папку)
        const tempDir = os.tmpdir();
        const uniqueId = Date.now();
        const safeFileName = originalName.replace(/[^a-zA-Z0-9.-]/g, "_");
        inputPath = path.join(tempDir, `input_${uniqueId}_${safeFileName}`);

        const nodeStream = Readable.fromWeb(file.stream() as any);
        await pipeline(nodeStream, createWriteStream(inputPath));

        const finalStats = await fs.stat(inputPath);
        
        // Повышаем лимит до 2 ГБ для поддержки больших видеофайлов
        const MAX_ALLOWED_BYTES = 2 * 1024 * 1024 * 1024;
        if (finalStats.size > MAX_ALLOWED_BYTES) {
            await fs.unlink(inputPath).catch(() => {});
            return NextResponse.json({ error: "Файл превышает лимит в 2 ГБ." }, { status: 400 });
        }

        const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        const storageChatId = process.env.TELEGRAM_STORAGE_CHAT_ID;

        if (!BOT_TOKEN || !storageChatId) {
            await fs.unlink(inputPath).catch(() => {});
            return NextResponse.json({ error: "Не настроен Telegram Storage" }, { status: 500 });
        }

        const prefixLabel = uploadType === "audio" ? "🎵 Track" : "🎥 Video";
        const telegramFormData = new FormData();
        telegramFormData.append("chat_id", storageChatId);
        telegramFormData.append("parse_mode", "HTML");
        telegramFormData.append("caption", `${prefixLabel}: ${userName}`);
        telegramFormData.append("supports_streaming", "true");

        // Читаем файл с диска и отправляем в Телеграм без изменений и сжатия
        const fileBuffer = await fs.readFile(inputPath);
        const nodeBlob = new NodeBlob([fileBuffer]);
        
        // Если это видео, используем sendVideo для корректного стриминга
        const isVideoFile = uploadType === "video" || originalName.match(/\.(mp4|mkv|mov|avi|webm)$/i);
        const telegramMethod = isVideoFile ? "sendVideo" : "sendDocument";
        
        if (isVideoFile) {
            telegramFormData.append("video", nodeBlob as any, originalName);
        } else {
            telegramFormData.append("document", nodeBlob as any, originalName);
        }

        const telegramRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${telegramMethod}`, {
            method: 'POST',
            body: telegramFormData,
        });

        const telegramResult = await telegramRes.json();

        await fs.unlink(inputPath).catch(() => {});

        if (!telegramRes.ok || !telegramResult.ok) {
            return NextResponse.json({ error: telegramResult?.description || "Ошибка Telegram API" }, { status: 500 });
        }

        const uploadedFile = telegramResult.result.document || telegramResult.result.video || telegramResult.result.audio;

        if (uploadedFile && uploadedFile.file_id) {
            const streamPrefix = uploadType === "audio" ? "/api/tracks/stream" : "/api/videos/stream";
            return NextResponse.json({
                success: true,
                fileId: uploadedFile.file_id,
                messageId: telegramResult.result.message_id,
                url: `${streamPrefix}/${uploadedFile.file_id}`,
                name: originalName,
            });
        }

        return NextResponse.json({ error: "Не удалось получить file_id" }, { status: 500 });

    } catch (error: any) {
        if (inputPath) await fs.unlink(inputPath).catch(() => {});
        console.error("🔥 Upload Error:", error);
        return NextResponse.json({ error: error.message || "Ошибка сервера" }, { status: 500 });
    }
}