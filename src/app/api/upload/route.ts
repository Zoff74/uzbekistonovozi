export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 600;
export const runtime = 'nodejs';

import { NextResponse, NextRequest } from "next/server";
import ImageKit from "@imagekit/nodejs";
import { getToken } from "next-auth/jwt";
import path from "path";
import os from "os";
import fs from "fs/promises";
import { createReadStream, createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { compressVideoPath } from "@/utils/videoCompressor";

// Инициализация ImageKit строго по актуальной типизации пакета
const imagekit = new ImageKit({
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY || "",
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

        if (!uploadType) {
            if (file.type.startsWith("image/") || originalName.match(/\.(jpg|jpeg|png|webp|avif)$/i)) {
                uploadType = "avatar";
            } else if (file.type.startsWith("audio/") || originalName.match(/\.(mp3|wav|wma|flac|aac|m4a)$/i)) {
                uploadType = "audio";
            } else {
                uploadType = "video";
            }
        }

        // Загрузка картинок через актуальное API ImageKit (.files)
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

        const tempDir = os.tmpdir();
        const uniqueId = Date.now();
        const safeFileName = originalName.replace(/[^a-zA-Z0-9.-]/g, "_");
        inputPath = path.join(tempDir, `input_${uniqueId}_${safeFileName}`);
        outputPath = path.join(tempDir, `output_${uniqueId}.mp4`);
        audioOutputPath = path.join(tempDir, `audio_${uniqueId}.mp3`);

        // Потоковая запись на диск без буферизации в RAM
        const nodeStream = Readable.fromWeb(file.stream() as any);
        await pipeline(nodeStream, createWriteStream(inputPath));

        let finalPathToUpload = inputPath;
        let finalFileName = originalName;

        if (uploadType === "video") {
            try {
                const compressionResult = await compressVideoPath(inputPath, outputPath, originalName);
                if (!compressionResult.success) {
                    return NextResponse.json({ error: compressionResult.error || "Ошибка сжатия видео" }, { status: 500 });
                }
                finalPathToUpload = outputPath;
                finalFileName = originalName.replace(/\.[^/.]+$/, "") + "_compressed.mp4";
            } catch (ffmpegErr: any) {
                console.error("FFmpeg error:", ffmpegErr);
                return NextResponse.json({ error: "Ошибка обработки FFmpeg: " + ffmpegErr.message }, { status: 500 });
            }
        }

        const finalStats = await fs.stat(finalPathToUpload);
        if (finalStats.size > 20 * 1024 * 1024) {
            return NextResponse.json({ error: "Файл превышает лимит Telegram в 20 МБ." }, { status: 400 });
        }

        const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        const storageChatId = process.env.TELEGRAM_STORAGE_CHAT_ID;

        if (!BOT_TOKEN || !storageChatId) {
            return NextResponse.json({ error: "Не настроен Telegram Storage" }, { status: 500 });
        }

        const prefixLabel = uploadType === "audio" ? "🎵 Track" : "🎥 Video";
        const telegramFormData = new FormData();
        telegramFormData.append("chat_id", storageChatId);
        telegramFormData.append("parse_mode", "HTML");
        telegramFormData.append("caption", `${prefixLabel}: ${userName}`);

        const fileStream = createReadStream(finalPathToUpload);
        const webUploadStream = new ReadableStream({
            start(controller) {
                fileStream.on('data', (chunk) => controller.enqueue(chunk));
                fileStream.on('end', () => controller.close());
                fileStream.on('error', (err) => controller.error(err));
            }
        });

        const fileBlob = await new Response(webUploadStream).blob();
        telegramFormData.append("document", fileBlob, finalFileName);

        const telegramRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, {
            method: 'POST',
            body: telegramFormData,
        });

        const telegramResult = await telegramRes.json();

        // Очистка временных файлов
        await fs.unlink(inputPath).catch(() => {});
        if (outputPath) await fs.unlink(outputPath).catch(() => {});
        if (audioOutputPath) await fs.unlink(audioOutputPath).catch(() => {});

        if (!telegramRes.ok || !telegramResult.ok) {
            return NextResponse.json({ error: telegramResult?.description || "Ошибка Telegram API" }, { status: 500 });
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

        return NextResponse.json({ error: "Не удалось получить file_id" }, { status: 500 });

    } catch (error: any) {
        if (inputPath) await fs.unlink(inputPath).catch(() => {});
        if (outputPath) await fs.unlink(outputPath).catch(() => {});
        if (audioOutputPath) await fs.unlink(audioOutputPath).catch(() => {});
        console.error("🔥 Upload Error:", error);
        return NextResponse.json({ error: error.message || "Ошибка сервера" }, { status: 500 });
    }
}