//src\app\api\upload\route.ts
// Обязательно в самом начале файла, до любых импортов
import { Logger } from "telegram/extensions/Logger";

// Жестко отключаем любые варнинги и логи внутри GramJS SDK
Logger.setLevel("none");
process.removeAllListeners('unhandledRejection');
process.on('unhandledRejection', (reason: any) => {
    const msg = reason?.message || String(reason);
    if (msg.includes('TIMEOUT') || msg.includes('updates.js') || reason?.stack?.includes('updates.js')) {
        return;
    }
});

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 600;
export const runtime = 'nodejs';


import { NextResponse, NextRequest } from "next/server";
import ImageKit from "@imagekit/nodejs";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth.config";
import path from "path";
import os from "os";
import fs from "fs/promises";
import { createReadStream, createWriteStream } from "fs";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";

const execFileAsync = promisify(execFile);

const imagekit = new ImageKit({
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY || "dummy_private_key",
});

// Мгновенная оптимизация MP4 (+faststart без перекодирования, 0.3 сек). Остальные форматы отправляются напрямую без задержек.
async function normalizeVideoForWeb(inputPath: string, tempDir: string, uniqueId: number): Promise<{ filePath: string; isTempConverted: boolean }> {
    const isMp4Ext = inputPath.toLowerCase().endsWith(".mp4");
    if (!isMp4Ext) {
        return { filePath: inputPath, isTempConverted: false };
    }

    const outputPath = path.join(tempDir, `web_${uniqueId}.mp4`);

    try {
        await execFileAsync("ffmpeg", [
            "-nostdin",
            "-y",
            "-i", inputPath,
            "-c", "copy",
            "-movflags", "+faststart",
            outputPath,
        ], { timeout: 15000 });

        const stat = await fs.stat(outputPath);
        if (stat.size > 1024) {
            return { filePath: outputPath, isTempConverted: true };
        }
    } catch {
        await fs.unlink(outputPath).catch(() => {});
    }

    return { filePath: inputPath, isTempConverted: false };
}

// MTProto клиент для обхода лимитов Telegram при загрузке видео >20МБ
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

export async function POST(request: NextRequest) {
    let inputPath = "";
    let convertedVideoPath = "";
    let mtprotoClient: TelegramClient | null = null;

    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user || !(session.user as any).id) {
            return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
        }

        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        const coverFile = formData.get("cover") as File | null;
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

        // 1. ИЗОБРАЖЕНИЯ / ОБЛОЖКИ — В IMAGEKIT
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

        // ПОДГОТОВКА ПОТОКА ФАЙЛА НА ДИСК
        const tempDir = os.tmpdir();
        const uniqueId = Date.now();
        const safeFileName = originalName.replace(/[^a-zA-Z0-9.-]/g, "_");
        inputPath = path.join(tempDir, `input_${uniqueId}_${safeFileName}`);

        const webStream = file.stream();
        const nodeReadable = Readable.fromWeb(webStream as any);
        const writeStream = createWriteStream(inputPath);
        await pipeline(nodeReadable, writeStream);

        const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        const privateChatId = process.env.TELEGRAM_STORAGE_CHAT_ID; // КАНАЛ ДЛЯ АУДИО (теперь связан с uzbekistonovozi_track)
        const videoChatId = process.env.TELEGRAM_VIDEO_CHAT_ID || process.env.TELEGRAM_VIDEO_CHANNEL_ID || "@uzbekistonovozi_video"; // ПУБЛИЧНЫЙ КАНАЛ ДЛЯ ВИДЕО

        // 2. АУДИО — В КАНАЛ ТРЕКОВ (uzbekistonovozi_track)
        if (uploadType === "audio") {
            if (!BOT_TOKEN || !privateChatId) {
                await fs.unlink(inputPath).catch(() => {});
                return NextResponse.json({ error: "Не настроены параметры для аудио" }, { status: 500 });
            }

            const stream = createReadStream(inputPath);
            const tgFormData = new globalThis.FormData();
            tgFormData.append('chat_id', privateChatId);
            
            const blob = await new Response(Readable.toWeb(stream) as any).blob();
            tgFormData.append('document', blob, originalName);
            tgFormData.append('caption', `🎵 ${originalName}`);
            tgFormData.append('parse_mode', 'HTML');

            if (coverFile) {
                const coverBuffer = await coverFile.arrayBuffer();
                const coverBlob = new Blob([coverBuffer], { type: coverFile.type || 'image/jpeg' });
                tgFormData.append('thumbnail', coverBlob, 'cover.jpg');
            }

            const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, {
                method: 'POST',
                body: tgFormData,
            });

            await fs.unlink(inputPath).catch(() => {});

            const responseText = await response.text();
            let data = responseText ? JSON.parse(responseText) : {};
            let uploadedFile = response.ok && data?.result ? (data.result.document || data.result.audio) : null;

            if (uploadedFile && uploadedFile.file_id) {
                return NextResponse.json({
                    success: true,
                    fileId: uploadedFile.file_id,
                    messageId: data.result.message_id,
                    url: `/api/tracks/stream/${uploadedFile.file_id}`,
                    name: originalName,
                });
            }

            return NextResponse.json({ error: data.description || "Ошибка загрузки аудио" }, { status: 500 });
        }

        // 3. ВИДЕО — СТРОГО В ПУБЛИЧНЫЙ КАНАЛ (@uzbekistonovozi_video) ЧЕРЕЗ MTPROTO
        if (uploadType === "video") {
            const normalized = await normalizeVideoForWeb(inputPath, tempDir, uniqueId);
            const finalUploadPath = normalized.filePath;
            if (normalized.isTempConverted) {
                convertedVideoPath = normalized.filePath;
            }

            mtprotoClient = await getMTProtoClient();
            const finalDisplayName = normalized.isTempConverted
                ? originalName.replace(/\.[^/.]+$/, "") + ".mp4"
                : originalName;
            const caption = `🎬 ${finalDisplayName}`;

            let thumbPath = "";
            if (coverFile) {
                const coverBuffer = Buffer.from(await coverFile.arrayBuffer());
                thumbPath = path.join(tempDir, `thumb_${uniqueId}.jpg`);
                await fs.writeFile(thumbPath, coverBuffer);
            }

            const targetEntity = await mtprotoClient.getEntity(videoChatId);

            const uploadedMessage = await mtprotoClient.sendFile(targetEntity, {
                file: finalUploadPath,
                caption: caption,
                parseMode: "html",
                thumb: thumbPath || undefined,
                forceDocument: true,
                workers: 2,
            });

            await mtprotoClient.disconnect().catch(() => {});
            mtprotoClient = null;

            await fs.unlink(inputPath).catch(() => {});
            if (convertedVideoPath) await fs.unlink(convertedVideoPath).catch(() => {});
            if (thumbPath) await fs.unlink(thumbPath).catch(() => {});

            const messageId = uploadedMessage.id;
            const postUrl = `https://t.me/uzbekistonovozi_video/${messageId}`;

            return NextResponse.json({
                success: true,
                fileId: postUrl,
                messageId: messageId,
                telegramMessageId: messageId,
                url: postUrl,
                name: finalDisplayName,
            });
        }

        await fs.unlink(inputPath).catch(() => {});
        return NextResponse.json({ error: "Неизвестный тип файла" }, { status: 400 });

    } catch (error: any) {
        if (mtprotoClient) {
            await mtprotoClient.disconnect().catch(() => {});
        }
        if (inputPath) await fs.unlink(inputPath).catch(() => {});
        if (convertedVideoPath) await fs.unlink(convertedVideoPath).catch(() => {});
        console.error("🔥 [UPLOAD ERROR]:", error);
        return NextResponse.json(
            { error: error.message || "Ошибка при обработке файла" },
            { status: 500 }
        );
    }
}