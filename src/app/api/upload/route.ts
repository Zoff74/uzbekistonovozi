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
import { createReadStream } from "fs";
import { Readable } from "stream";
import ffmpeg from "fluent-ffmpeg";

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

        // 3. ВИДЕО — сжатие точно под 19 МБ (2-pass для высокого качества)
        if (uploadType === "video") {
            const fileStats = await fs.stat(inputPath);
            if (fileStats.size > 19 * 1024 * 1024) {
                try {
                    const duration = await new Promise<number>((resolve, reject) => {
                        ffmpeg.ffprobe(inputPath, (err, metadata) => {
                            if (err || !metadata.format || !metadata.format.duration) {
                                reject(new Error("Не удалось определить длительность видеофайла"));
                            } else {
                                resolve(metadata.format.duration);
                            }
                        });
                    });

                    // Целевой размер строго 19 МБ в битах
                    const targetSizeMB = 19;
                    const totalBits = targetSizeMB * 1024 * 1024 * 8;
                    const audioBitrateKbps = 96; 
                    const audioBits = audioBitrateKbps * 1000 * duration;
                    
                    let videoBitrateKbps = Math.floor((totalBits - audioBits) / duration / 1000);
                    if (videoBitrateKbps < 300) videoBitrateKbps = 300;

                    const videoBitrateStr = `${videoBitrateKbps}k`;

                    // ПЕРВЫЙ ПРОХОД (анализ)
                    const logPath = path.join(tempDir, `ffmpeg2pass_${uniqueId}.log`);
                    await new Promise<void>((resolve, reject) => {
                        ffmpeg(inputPath)
                            .outputOptions([
                                "-c:v libx264",
                                `-b:v ${videoBitrateStr}`,
                                "-pass 1",
                                "-an",
                                "-f null"
                            ])
                            .output(logPath)
                            .on('end', () => resolve())
                            .on('error', (err) => reject(err))
                            .run();
                    });

                    // ВТОРОЙ ПРОХОД (финальная запись с сохранением качества)
                    await new Promise<void>((resolve, reject) => {
                        ffmpeg(inputPath)
                            .outputOptions([
                                "-c:v libx264",
                                `-b:v ${videoBitrateStr}`,
                                "-pass 2",
                                "-preset slow",
                                "-c:a aac",
                                `-b:a ${audioBitrateKbps}k`,
                                "-pix_fmt yuv420p",
                                "-movflags +faststart",
                                `-passlogfile ${logPath}`
                            ])
                            .output(outputPath)
                            .on('end', () => resolve())
                            .on('error', (err) => reject(err))
                            .run();
                    });

                    await fs.unlink(logPath).catch(() => {});

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

        // Отправка через sendDocument (только для аудио и видео)
        const stream = createReadStream(finalPathToUpload);
        const tgFormData = new globalThis.FormData();
        tgFormData.append('chat_id', storageChatId);
        
        const blob = await new Response(Readable.toWeb(stream) as any).blob();
        const prefixLabel = uploadType === "audio" ? "🎵 Track" : "🎥 Video";
        
        tgFormData.append('document', blob, finalFileName);
        tgFormData.append('caption', `${prefixLabel}: ${(session.user as any).name || (session.user as any).id}`);
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
        if (outputPath) await fs.unlink(outputPath).catch(() => {});
        if (audioOutputPath) await fs.unlink(audioOutputPath).catch(() => {});

        const responseText = await response.text();
        let data;
        try {
            data = responseText ? JSON.parse(responseText) : {};
        } catch {
            return NextResponse.json({ error: `Ошибка ответа хранилища (HTTP ${response.status}): ${responseText}` }, { status: 500 });
        }

        let uploadedFile = null;
        if (response.ok && data && data.ok && data.result) {
            uploadedFile = data.result.document || data.result.audio || data.result.voice || data.result.video;
        }

        if (uploadedFile && uploadedFile.file_id) {
            const streamPrefix = uploadType === "audio" ? "/api/tracks/stream" : "/api/videos/stream";

            return NextResponse.json({
                success: true,
                fileId: uploadedFile.file_id,
                messageId: data.result.message_id,
                url: `${streamPrefix}/${uploadedFile.file_id}`,
                name: originalName,
            });
        }

        const errorMsg = data.description || `Ошибка хранилища: HTTP ${response.status}`;
        return NextResponse.json({ error: errorMsg }, { status: 500 });

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