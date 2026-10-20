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

        // 1. ИЗОБРАЖЕНИЕ / ОБЛОЖКА
        if (uploadType === "image" || uploadType === "cover" || uploadType === "avatar") {
            const oldFileId = formData.get("oldFileId") as string | null;
            const buffer = Buffer.from(await file.arrayBuffer());
            const uniqueFileName = `${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
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

        // 2. ВИДЕО
        const tempDir = os.tmpdir();
        const uniqueId = Date.now();
        const safeFileName = originalName.replace(/[^a-zA-Z0-9.-]/g, "_");
        inputPath = path.join(tempDir, `input_${uniqueId}_${safeFileName}`);
        outputPath = path.join(tempDir, `output_${uniqueId}.mp4`);

        // Безопасное сохранение файла на диск целиком (без сбоев стрима)
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        await fs.writeFile(inputPath, buffer);

        const fileStats = await fs.stat(inputPath);
        let finalPathToUpload = inputPath;
        let finalFileName = originalName;

        // Если файл > 18 МБ — запускаем FFmpeg
        if (fileStats.size > 18 * 1024 * 1024) {
            try {
                await new Promise<void>((resolve, reject) => {
                    ffmpeg(inputPath)
                        .output(outputPath)
                        .videoCodec('libx264')
                        .audioCodec('aac')
                        .audioBitrate('128k')
                        .outputOptions([
                            '-preset ultrafast', // Минимизирует CPU нагрузку
                            '-crf 32',
                            '-vf scale=-2:360',  // Принудительное 360p для укладывания в лимит 20 МБ
                            '-pix_fmt yuv420p',
                            '-movflags +faststart',
                        ])
                        .on('end', () => resolve())
                        .on('error', (err) => reject(err))
                        .run();
                });

                finalPathToUpload = outputPath;
                finalFileName = originalName.replace(/\.[^/.]+$/, "") + "_compressed.mp4";

            } catch (ffmpegErr: any) {
                console.error("FFmpeg error:", ffmpegErr);
                await fs.unlink(inputPath).catch(() => {});
                await fs.unlink(outputPath).catch(() => {});
                return NextResponse.json({ error: "Ошибка сжатия видео: " + ffmpegErr.message }, { status: 500 });
            }
        }

        const finalStats = await fs.stat(finalPathToUpload);
        if (finalStats.size > 50 * 1024 * 1024) {
            await fs.unlink(inputPath).catch(() => {});
            if (outputPath) await fs.unlink(outputPath).catch(() => {});
            return NextResponse.json({ error: "Файл превышает допустимый размер даже после обработки." }, { status: 400 });
        }

        const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        const storageChatId = process.env.TELEGRAM_STORAGE_CHAT_ID;

        if (!BOT_TOKEN || !storageChatId) {
            await fs.unlink(inputPath).catch(() => {});
            if (outputPath) await fs.unlink(outputPath).catch(() => {});
            return NextResponse.json({ error: "Ошибка конфигурации хранилища" }, { status: 500 });
        }

        // Отправка готового файла в Telegram
        const stream = createReadStream(finalPathToUpload);
        const tgFormData = new globalThis.FormData();
        tgFormData.append('chat_id', storageChatId);
        
        const blob = await new Response(Readable.toWeb(stream) as any).blob();
        tgFormData.append('document', blob, finalFileName);
        tgFormData.append('caption', `🎥 Video: ${(session.user as any).name || (session.user as any).id}`);
        tgFormData.append('parse_mode', 'HTML');

        const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, {
            method: 'POST',
            body: tgFormData,
        });

        // Очищаем временные файлы
        await fs.unlink(inputPath).catch(() => {});
        if (outputPath) await fs.unlink(outputPath).catch(() => {});

        const responseText = await response.text();
        let data;
        try {
            data = responseText ? JSON.parse(responseText) : {};
        } catch {
            return NextResponse.json({ error: `Ошибка ответа хранилища (HTTP ${response.status})` }, { status: 500 });
        }

        if (response.ok && data && data.ok && data.result && data.result.document) {
            return NextResponse.json({
                success: true,
                fileId: data.result.document.file_id,
                messageId: data.result.message_id,
                url: `/api/videos/stream/${data.result.document.file_id}`,
                name: originalName,
            });
        }

        const errorMsg = data.description || `Ошибка хранилища: HTTP ${response.status}`;
        return NextResponse.json({ error: errorMsg }, { status: 500 });

    } catch (error: any) {
        if (inputPath) await fs.unlink(inputPath).catch(() => {});
        if (outputPath) await fs.unlink(outputPath).catch(() => {});
        console.error("Upload error:", error);
        return NextResponse.json(
            { error: error.message || "Ошибка при обработке файла" },
            { status: 500 }
        );
    }
}