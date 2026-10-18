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

        // 1. ЕСЛИ ЭТО ИЗОБРАЖЕНИЕ (ОБЛОЖКА / АВАТАРКА)
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

        // 2. РАБОТА С ВИДЕО
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        if (buffer.length === 0) {
            return NextResponse.json({ error: "Файл пустой" }, { status: 400 });
        }

        let fileToSendBuffer = buffer;
        let finalFileName = originalName;

        // Если файл больше 48 МБ — сжимаем через системный FFmpeg
        if (buffer.length > 48 * 1024 * 1024) {
            const tempDir = os.tmpdir();
            const uniqueId = Date.now();
            const safeFileName = originalName.replace(/[^a-zA-Z0-9.-]/g, "_");
            const inputPath = path.join(tempDir, `input_${uniqueId}_${safeFileName}`);
            const outputPath = path.join(tempDir, `output_${uniqueId}.mp4`);

            await fs.writeFile(inputPath, buffer);

            console.log("🎬 Файл больше 48 МБ. Запускаем серверное сжатие в 480p через ffmpeg...");

            try {
                await new Promise<void>((resolve, reject) => {
                    ffmpeg(inputPath)
                        .output(outputPath)
                        .videoCodec('libx264')
                        .audioCodec('copy')
                        .size('?x480')
                        .outputOptions([
                            '-preset ultrafast',
                            '-tune zerolatency',
                            '-crf 33',
                            '-pix_fmt yuv420p'
                        ])
                        .on('end', () => resolve())
                        .on('error', (err) => reject(err))
                        .run();
                });

                console.log("✅ Серверное сжатие видео успешно завершено!");

                fileToSendBuffer = await fs.readFile(outputPath);
                finalFileName = originalName.replace(/\.[^/.]+$/, "") + "_480p_optimized.mp4";

            } catch (ffmpegErr: any) {
                console.error("FFmpeg compression error:", ffmpegErr);
                return NextResponse.json({ error: "Ошибка при сжатии видео на сервере: " + ffmpegErr.message }, { status: 500 });
            } finally {
                await fs.unlink(inputPath).catch(() => {});
                await fs.unlink(outputPath).catch(() => {});
            }

            if (fileToSendBuffer.length > 50 * 1024 * 1024) {
                return NextResponse.json({ error: "Файл слишком большой даже после сжатия (превышает 50 МБ)" }, { status: 400 });
            }
        } else {
            console.log("⚡ Файл меньше 48 МБ. Сжатие не требуется, отправляем напрямую.");
        }

        const tgResult = await uploadVideoToTelegramStorage(
            fileToSendBuffer,
            finalFileName,
            `🎥 Видео от пользователя: ${(session.user as any).name || (session.user as any).id}`
        );

        if (!tgResult.success) {
            return NextResponse.json({ error: tgResult.error || "Ошибка загрузки видео в Telegram" }, { status: 500 });
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
            { error: error.message || "Ошибка при загрузке или сжатии файла" },
            { status: 500 }
        );
    }
}

export async function DELETE(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user || !(session.user as any).id) {
            return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
        }

        const userId = (session.user as any).id;
        const userRole = (session.user as any).role;
        const isAdmin = userRole === 'admin' || (session.user as any).isAdmin === true;

        const { searchParams } = new URL(request.url);
        const fileId = searchParams.get("fileId");
        const fileUrl = searchParams.get("fileUrl");

        if (!fileId && !fileUrl) {
            return NextResponse.json({ error: "fileId или fileUrl не передан" }, { status: 400 });
        }

        if (!isAdmin) {
            await dbConnect();
            const orConditions: any[] = [];
            if (fileId) {
                orConditions.push(
                    { videoUrl: { $regex: fileId,$options: "i" } },
                    { cover: { $regex: fileId,$options: "i" } },
                    { coverFileId: fileId },
                    { videoFileId: fileId },
                    { audioUrl: { $regex: fileId,$options: "i" } },
                    { audioFileId: fileId }
                );
            }
            if (fileUrl) {
                orConditions.push(
                    { videoUrl: fileUrl },
                    { cover: fileUrl },
                    { audioUrl: fileUrl }
                );
            }

            const videoResults = await (Video as any).find({ authorId: userId, $or: orConditions }).limit(1).lean();
            let ownedItem = videoResults[0];

            if (!ownedItem) {
                const trackResults = await (Track as any).find({ authorId: userId, $or: orConditions }).limit(1).lean();
                ownedItem = trackResults[0];
            }

            if (!ownedItem) {
                return NextResponse.json({ error: "Доступ запрещен. Вы не автор этого файла." }, { status: 403 });
            }
        }

        if (fileId && !fileId.startsWith("BAACAg")) {
            await imagekit.deleteFile(fileId);
        }

        return NextResponse.json({ success: true, message: "Файл успешно удален из хранилища" });
    } catch (error: any) {
        console.error("Delete error:", error);
        return NextResponse.json({ error: error.message || "Ошибка при удалении файла" }, { status: 500 });
    }
}