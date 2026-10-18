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
import { Track } from "@/models/Track";
import { uploadVideoToTelegramStorage } from "@/actions/telegram.action";
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

        // Если файл больше 48 МБ — сжимаем на диске
        if (fileStats.size > 48 * 1024 * 1024) {
            console.log(`🎬 [Stream] Запуск сжатия файла (${(fileStats.size / 1024 / 1024).toFixed(1)} МБ) через ffmpeg...`);

            try {
                await new Promise<void>((resolve, reject) => {
                    ffmpeg(inputPath)
                        .output(outputPath)
                        .videoCodec('libx264')
                        .audioCodec('copy')
                        .size('?x480')
                        .outputOptions([
    '-preset superfast',
    '-tune zerolatency',
    '-crf 36',
    '-pix_fmt yuv420p'
])
                        .on('end', () => resolve())
                        .on('error', (err) => reject(err))
                        .run();
                });

                console.log("✅ Серверное сжатие завершено успешно!");
                finalPathToUpload = outputPath;
                finalFileName = originalName.replace(/\.[^/.]+$/, "") + "_480p.mp4";

            } catch (ffmpegErr: any) {
                console.error("FFmpeg error:", ffmpegErr);
                await fs.unlink(inputPath).catch(() => {});
                await fs.unlink(outputPath).catch(() => {});
                return NextResponse.json({ error: "Ошибка сжатия: " + ffmpegErr.message }, { status: 500 });
            }
        }

        // Читаем сжатый файл для отправки в Telegram
        const fileToSendBuffer = await fs.readFile(finalPathToUpload);

        // Очищаем временные файлы
        await fs.unlink(inputPath).catch(() => {});
        await fs.unlink(outputPath).catch(() => {});

        if (fileToSendBuffer.length > 50 * 1024 * 1024) {
            return NextResponse.json({ error: "Файл превышает 50 МБ даже после сжатия" }, { status: 400 });
        }

        console.log("📤 Отправка сжатого файла в Telegram...");
        const tgResult = await uploadVideoToTelegramStorage(
            fileToSendBuffer,
            finalFileName,
            `🎥 Видео: ${(session.user as any).name || (session.user as any).id}`
        );

        if (!tgResult.success) {
            return NextResponse.json({ error: tgResult.error || "Ошибка загрузки в Telegram" }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            fileId: tgResult.fileId,
            url: `/api/videos/stream/${tgResult.fileId}`,
            name: originalName,
        });

    } catch (error: any) {
        console.error("Upload error:", error);
        return NextResponse.json(
            { error: error.message || "Ошибка при обработке файла" },
            { status: 500 }
        );
    }
}