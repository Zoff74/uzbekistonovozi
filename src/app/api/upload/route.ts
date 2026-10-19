// src/app/api/upload/route.ts
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 600;
export const runtime = 'nodejs';

import { NextResponse, NextRequest } from "next/server";
import ImageKit from "imagekit";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth.config";
import { dbConnect } from "@/lib/mongoose";
import { Video } from "@/models/Video";
import path from "path";
import os from "os";
import fs from "fs/promises";
import { createWriteStream } from "fs";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import ffmpeg from "fluent-ffmpeg";

const imagekit = new ImageKit({
    publicKey: process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY || "dummy_public_key",
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY || "dummy_private_key",
    urlEndpoint: process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT || "https://ik.imagekit.io/tyhsos05b",
});

export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user || !(session.user as any).id) {
            return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
        }

        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        const uploadType = (formData.get("type") as string) || request.headers.get("x-upload-type") || "video";

        if (!file) {
            return NextResponse.json({ error: "Файл не передан" }, { status: 400 });
        }

        const headerName = request.headers.get("x-file-name");
        let originalName = file.name || "video.mp4";
        if (headerName) {
            try {
                originalName = decodeURIComponent(headerName);
            } catch {
                originalName = headerName;
            }
        }

        // 1. ЕСЛИ ЭТО ИЗОБРАЖЕНИЕ
        if (uploadType === "image" || uploadType === "cover" || uploadType === "avatar") {
            const oldFileId = formData.get("oldFileId") as string | null;
            const buffer = Buffer.from(await file.arrayBuffer());
            const uniqueFileName = `${Date.now()}_${file.name}`;
            const mainFolder = process.env.NEXT_PUBLIC_IMAGEKIT_FOLDER || "";
            const defaultFolder = mainFolder ? `/${mainFolder}/avatars` : "/avatars";
            const folder = (formData.get("folder") as string) || defaultFolder;

            const uploadResponse = await imagekit.upload({
                file: buffer,
                fileName: uniqueFileName,
                folder: folder,
            });

            if (oldFileId && !oldFileId.startsWith("BAACAg")) {
                try {
                    await imagekit.deleteFile(oldFileId);
                } catch (err) {
                    console.error("Ошибка при удалении старого файла из ImageKit:", err);
                }
            }

            return NextResponse.json({
                success: true,
                fileId: uploadResponse.fileId,
                url: uploadResponse.url,
                name: uploadResponse.name,
            });
        } 

        // 2. РАБОТА С ВИДЕО (ЗАПИСЬ НА ДИСК ЧЕРЕЗ СТРИМ БЕЗ ЗАБИВАНИЯ RAM)
        const tempDir = os.tmpdir();
        const uniqueId = Date.now();
        const safeFileName = originalName.replace(/[^a-zA-Z0-9.-]/g, "_");
        const inputPath = path.join(tempDir, `input_${uniqueId}_${safeFileName}`);
        const outputPath = path.join(tempDir, `output_${uniqueId}.mp4`);

        // Стримим файл прямо на диск
        const nodeStream = Readable.fromWeb(file.stream() as any);
        await pipeline(nodeStream, createWriteStream(inputPath));

        const fileStats = await fs.stat(inputPath);
        let finalPathToUpload = inputPath;
        let finalFileName = originalName;

        // Если файл больше 48 МБ — сжимаем в 480p на максимальной скорости CPU
        if (fileStats.size > 48 * 1024 * 1024) {
            console.log(`🎬 [Stream] Запуск быстрого сжатия в 480p (${(fileStats.size / 1024 / 1024).toFixed(1)} МБ)...`);

            try {
                await new Promise<void>((resolve, reject) => {
                    ffmpeg(inputPath)
                        .output(outputPath)
                        .videoCodec('libx264')
                        .audioCodec('aac')
                        .audioBitrate('128k')
                        .size('?x480')        // 480p — хорошая середина
                        .outputOptions([
                            '-preset ultrafast', // Максимальная скорость без затыков процессора
                            '-crf 30',           // Отличный баланс между размером (<50МБ) и отсутствием сильной зернистости
                            '-pix_fmt yuv420p',
                            '-threads 0'
                        ])
                        .on('end', () => resolve())
                        .on('error', (err) => reject(err))
                        .run();
                });

                console.log("✅ Быстрое сжатие в 480p завершено!");
                finalPathToUpload = outputPath;
                finalFileName = originalName.replace(/\.[^/.]+$/, "") + "_480p.mp4";

            } catch (ffmpegErr: any) {
                console.error("FFmpeg error:", ffmpegErr);
                await fs.unlink(inputPath).catch(() => {});
                await fs.unlink(outputPath).catch(() => {});
                return NextResponse.json({ error: "Ошибка сжатия видео: " + ffmpegErr.message }, { status: 500 });
            }
        }

        // Читаем сжатый файл для отправки в Telegram
        const fileToSendBuffer = await fs.readFile(finalPathToUpload);

        // Очищаем временные файлы
        await fs.unlink(inputPath).catch(() => {});
        await fs.unlink(outputPath).catch(() => {});

        if (fileToSendBuffer.length > 50 * 1024 * 1024) {
            return NextResponse.json({ error: "Файл превышает 50 МБ даже после сжатия. Пожалуйста, выберите файл поменьше." }, { status: 400 });
        }

        console.log("📤 Отправка файла в Telegram...");
        const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        const storageChatId = process.env.TELEGRAM_STORAGE_CHAT_ID;

        if (!BOT_TOKEN || !storageChatId) {
            return NextResponse.json({ error: "Telegram бот или TELEGRAM_STORAGE_CHAT_ID не настроены" }, { status: 500 });
        }

        const tgFormData = new globalThis.FormData();
        tgFormData.append('chat_id', storageChatId);
        
        const uint8Array = new Uint8Array(fileToSendBuffer);
        const blob = new Blob([uint8Array], { type: 'video/mp4' });
        
        tgFormData.append('document', blob, finalFileName);
        tgFormData.append('caption', `🎥 Видео: ${(session.user as any).name || (session.user as any).id}`);
        tgFormData.append('parse_mode', 'HTML');

        const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, {
            method: 'POST',
            body: tgFormData,
        });

        const responseText = await response.text();
        let data;
        try {
            data = responseText ? JSON.parse(responseText) : {};
        } catch {
            return { success: false, error: `Ошибка ответа Telegram (HTTP ${response.status}): ${responseText}` };
        }

        if (response.ok && data && data.ok && data.result && data.result.document) {
            return NextResponse.json({
                success: true,
                fileId: data.result.document.file_id,
                messageId: data.result.message_id, // 👈 Возвращаем ID сообщения для удаления
                url: `/api/videos/stream/${data.result.document.file_id}`,
                name: originalName,
            });
        }

        const errorMsg = data.description || `Ошибка Telegram API: HTTP ${response.status}`;
        console.error("ОШИБКА ЗАГРУЗКИ ВИДЕО В TELEGRAM STORAGE:", errorMsg);
        return NextResponse.json({ error: errorMsg }, { status: 500 });

    } catch (error: any) {
        console.error("Upload error:", error);
        return NextResponse.json(
            { error: error.message || "Ошибка при обработке файла" },
            { status: 500 }
        );
    }
}