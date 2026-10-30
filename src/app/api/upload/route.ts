export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 600;
export const runtime = 'nodejs';

// src/app/api/upload/route.ts
import { NextResponse, NextRequest } from "next/server";
import ImageKit from "@imagekit/nodejs";
import { getToken } from "next-auth/jwt";
import path from "path";
import os from "os";
import fs from "fs/promises";
import { createReadStream } from "fs";
import ffmpeg from "fluent-ffmpeg";
import { compressVideoPath } from "@/utils/videoCompressor";

const imagekit = new ImageKit({
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY || "dummy_private_key",
});

export async function POST(request: NextRequest) {
    let inputPath = "";
    let outputPath = "";
    let audioOutputPath = "";

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

        // Сохраняем входящий поток файла на диск частями (без забивания оперативки)
        const fileBuffer = Buffer.from(await file.arrayBuffer());
        await fs.writeFile(inputPath, fileBuffer);

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

        // 3. ВИДЕО — сжатие прямо с диска без раздутия памяти
if (uploadType === "video") {
    try {
        const compressionResult = await compressVideoPath(inputPath, outputPath, originalName);

        if (!compressionResult.success) {
            return NextResponse.json({ error: compressionResult.error || "Ошибка сжатия видео" }, { status: 500 });
        }

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

        // ОТПРАВКА В TELEGRAM ЧЕРЕЗ ПОТОКОВЫЙ FETCH БЕЗ ОГРОМНЫХ БУФЕРОВ
        const prefixLabel = uploadType === "audio" ? "🎵 Track" : "🎥 Video";
        const captionText = `${prefixLabel}: ${userName}`;

        const telegramFormData = new FormData();
        telegramFormData.append("chat_id", storageChatId);
        telegramFormData.append("parse_mode", "HTML");
        telegramFormData.append("caption", captionText);

        // Читаем файл стримом с диска без буферизации в памяти
        const fileStream = createReadStream(finalPathToUpload);
        const webStream = new ReadableStream({
            start(controller) {
                fileStream.on('data', (chunk) => controller.enqueue(chunk));
                fileStream.on('end', () => controller.close());
                fileStream.on('error', (err) => controller.error(err));
            }
        });

        const fileBlob = await new Response(webStream).blob();
        telegramFormData.append("document", fileBlob, finalFileName);

        console.log(`[UPLOAD] Отправка файла в Telegram потоком...`);
        const telegramRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, {
            method: 'POST',
            body: telegramFormData,
        });

        const telegramResult = await telegramRes.json();

        // Очищаем временные файлы
        await fs.unlink(inputPath).catch(() => {});
        if (outputPath) await fs.unlink(outputPath).catch(() => {});
        if (audioOutputPath) await fs.unlink(audioOutputPath).catch(() => {});

        if (!telegramRes.ok || !telegramResult.ok) {
            const errorMsg = telegramResult?.description || `Ошибка хранилища: HTTP ${telegramRes.status}`;
            return NextResponse.json({ error: errorMsg }, { status: 500 });
        }

        const uploadedFile = telegramResult.result.document || telegramResult.result.audio || telegramResult.result.voice || telegramResult.result.video;

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