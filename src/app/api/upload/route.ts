export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 600;
export const runtime = 'nodejs';

// src\app\api\upload\route.ts
import { NextResponse, NextRequest } from "next/server";
import ImageKit from "@imagekit/nodejs";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth.config";
import path from "path";
import os from "os";
import fs from "fs/promises";
import https from "https";
import ffmpeg from "fluent-ffmpeg";
import { compressVideoBuffer } from "@/utils/videoCompressor";

const imagekit = new ImageKit({
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY || "dummy_private_key",
});

export async function POST(request: NextRequest) {
    let inputPath = "";
    let outputPath = "";
    let audioOutputPath = "";

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

        // АВТООПРЕДЕЛЕНИЕ ТИПА ЕСЛИ НЕ ПЕРЕДАН ЯВНО
        if (!uploadType) {
            if (file.type.startsWith("image/") || originalName.match(/\.(jpg|jpeg|png|webp|avif)$/i)) {
                uploadType = "avatar";
            } else if (file.type.startsWith("audio/") || originalName.match(/\.(mp3|wav|wma|flac|aac|m4a)$/i)) {
                uploadType = "audio";
            } else {
                uploadType = "video";
            }
        }

        // 1. ИЗОБРАЖЕНИЕ / АВАТАР / ОБЛОЖКА — ИДЕТ ИСКЛЮЧИТЕЛЬНО В IMAGEKIT
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

        // Подготовка временных путей для аудио/видео
        const tempDir = os.tmpdir();
        const uniqueId = Date.now();
        const safeFileName = originalName.replace(/[^a-zA-Z0-9.-]/g, "_");
        inputPath = path.join(tempDir, `input_${uniqueId}_${safeFileName}`);
        outputPath = path.join(tempDir, `output_${uniqueId}.mp4`);
        audioOutputPath = path.join(tempDir, `audio_${uniqueId}.mp3`);

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        await fs.writeFile(inputPath, buffer);

        let finalPathToUpload = inputPath;
        let finalFileName = originalName;

        // 2. АУДИО — КОНВЕРТАЦИЯ В MP3
        if (uploadType === "audio") {
            try {
                await new Promise<void>((resolve, reject) => {
                    ffmpeg(inputPath)
                        .output(audioOutputPath)
                        .toFormat("mp3")
                        .audioCodec("libmp3lame")
                        .audioBitrate("192k")
                        .on('end', () => resolve())
                        .on('error', (err) => reject(err))
                        .run();
                });

                finalPathToUpload = audioOutputPath;
                const baseName = originalName.replace(/\.[^/.]+$/, "");
                finalFileName = `${baseName}_converted.mp3`;
            } catch (convErr: any) {
                console.error("FFmpeg audio conversion error:", convErr);
                finalPathToUpload = inputPath;
                finalFileName = originalName;
            }
        }

        // 3. ВИДЕО — сжатие через общую утилиту (до ~19.5 МБ с качественным звуком)
        if (uploadType === "video") {
            try {
                const videoBuffer = await fs.readFile(inputPath);
                const compressionResult = await compressVideoBuffer(videoBuffer, originalName);

                if (!compressionResult.success || !compressionResult.buffer) {
                    return NextResponse.json({ error: compressionResult.error || "Ошибка сжатия видео" }, { status: 500 });
                }

                await fs.writeFile(outputPath, compressionResult.buffer);
                finalPathToUpload = outputPath;
                finalFileName = originalName.replace(/\.[^/.]+$/, "") + "_compressed.mp4";

            } catch (ffmpegErr: any) {
                console.error("FFmpeg video error:", ffmpegErr);
                await fs.unlink(inputPath).catch(() => {});
                await fs.unlink(outputPath).catch(() => {});
                await fs.unlink(audioOutputPath).catch(() => {});
                return NextResponse.json({ error: "Ошибка сжатия видео: " + ffmpegErr.message }, { status: 500 });
            }
        }

        const finalStats = await fs.stat(finalPathToUpload);
        if (finalStats.size > 20 * 1024 * 1024) {
            await fs.unlink(inputPath).catch(() => {});
            if (outputPath) await fs.unlink(outputPath).catch(() => {});
            if (audioOutputPath) await fs.unlink(audioOutputPath).catch(() => {});
            return NextResponse.json({ error: "Ошибка: даже после сжатия файл превышает 20 МБ." }, { status: 400 });
        }

        const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        const storageChatId = process.env.TELEGRAM_STORAGE_CHAT_ID;

        if (!BOT_TOKEN || !storageChatId) {
            await fs.unlink(inputPath).catch(() => {});
            if (outputPath) await fs.unlink(outputPath).catch(() => {});
            if (audioOutputPath) await fs.unlink(audioOutputPath).catch(() => {});
            return NextResponse.json({ error: "Ошибка конфигурации хранилища (нет токена или Chat ID)" }, { status: 500 });
        }

        // Отправка в Telegram через нативный HTTPS-запрос БЕЗ КАКИХ-ЛИБО ТАЙМАУТОВ (ждёт сколько нужно)
        const fileBufferToUpload = await fs.readFile(finalPathToUpload);
        const prefixLabel = uploadType === "audio" ? "🎵 Track" : "🎥 Video";
        const captionText = `${prefixLabel}: ${(session.user as any).name || (session.user as any).id}`;

        const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
        const headerBuffers: Buffer[] = [];

        headerBuffers.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${storageChatId}\r\n`));
        headerBuffers.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="parse_mode"\r\n\r\nHTML\r\n`));
        headerBuffers.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${captionText}\r\n`));

        const mimeType = uploadType === "audio" ? "audio/mpeg" : "video/mp4";
        headerBuffers.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="document"; filename="${encodeURIComponent(finalFileName)}"\r\nContent-Type: ${mimeType}\r\n\r\n`));

        const footerBuffer = Buffer.from(`\r\n--${boundary}--\r\n`);
        const bodyBuffer = Buffer.concat([
            Buffer.concat(headerBuffers),
            fileBufferToUpload,
            footerBuffer
        ]);

        const telegramResult: { ok: boolean; status: number; data: any } = await new Promise((resolve, reject) => {
            const req = https.request({
                hostname: 'api.telegram.org',
                port: 443,
                path: `/bot${BOT_TOKEN}/sendDocument`,
                method: 'POST',
                headers: {
                    'Content-Type': `multipart/form-data; boundary=${boundary}`,
                    'Content-Length': bodyBuffer.length,
                },
                // БЕЗ ТАЙМАУТА — СОЕДИНЕНИЕ БУДЕТ ЖДАТЬ СКОЛЬКО УГОДНО ВРЕМЕНИ
            }, (res) => {
                let responseData = '';
                res.on('data', (chunk) => { responseData += chunk; });
                res.on('end', () => {
                    try {
                        const json = responseData ? JSON.parse(responseData) : {};
                        resolve({ ok: res.statusCode === 200, status: res.statusCode || 500, data: json });
                    } catch {
                        resolve({ ok: false, status: res.statusCode || 500, data: { description: responseData } });
                    }
                });
            });

            req.on('error', (err) => reject(err));

            req.write(bodyBuffer);
            req.end();
        });

        await fs.unlink(inputPath).catch(() => {});
        if (outputPath) await fs.unlink(outputPath).catch(() => {});
        if (audioOutputPath) await fs.unlink(audioOutputPath).catch(() => {});

        if (!telegramResult.ok || !telegramResult.data.ok) {
            const errorMsg = telegramResult.data?.description || `Ошибка хранилища: HTTP ${telegramResult.status}`;
            return NextResponse.json({ error: errorMsg }, { status: 500 });
        }

        const uploadedFile = telegramResult.data.result.document || telegramResult.data.result.audio || telegramResult.data.result.voice || telegramResult.data.result.video;

        if (uploadedFile && uploadedFile.file_id) {
            const streamPrefix = uploadType === "audio" ? "/api/tracks/stream" : "/api/videos/stream";

            return NextResponse.json({
                success: true,
                fileId: uploadedFile.file_id,
                messageId: telegramResult.data.result.message_id,
                url: `${streamPrefix}/${uploadedFile.file_id}`,
                name: originalName,
            });
        }

        return NextResponse.json({ error: "Не удалось получить file_id от сервера" }, { status: 500 });

    } catch (error: any) {
        if (inputPath) await fs.unlink(inputPath).catch(() => {});
        if (outputPath) await fs.unlink(outputPath).catch(() => {});
        if (audioOutputPath) await fs.unlink(audioOutputPath).catch(() => {});
        console.error("🔥 [UPLOAD CRITICAL ERROR]:", error);
        return NextResponse.json(
            { error: error.message || "Ошибка при обработке файла" },
            { status: 500 }
        );
    }
}