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

const imagekit = new ImageKit({
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY || "dummy_private_key",
});

export async function POST(request: NextRequest) {
    let inputPath = "";

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

        // 2. АУДИО И ВИДЕО — ОТПРАВКА В ТЕЛЕГРАМ БЕЗ СЖАТИЯ
        const tempDir = os.tmpdir();
        const uniqueId = Date.now();
        const safeFileName = originalName.replace(/[^a-zA-Z0-9.-]/g, "_");
        inputPath = path.join(tempDir, `input_${uniqueId}_${safeFileName}`);

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        await fs.writeFile(inputPath, buffer);

        const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        const privateChatId = process.env.TELEGRAM_STORAGE_CHAT_ID; // Для треков
        // Берем специальный ID или юзернейм публичного канала для видео (например, @uzbekistonovozi_video или -100...)
        const videoChatId = process.env.TELEGRAM_VIDEO_CHAT_ID || process.env.TELEGRAM_VIDEO_CHANNEL_ID || "@uzbekistonovozi_video";

        if (!BOT_TOKEN) {
            await fs.unlink(inputPath).catch(() => {});
            return NextResponse.json({ error: "Не задан TELEGRAM_BOT_TOKEN" }, { status: 500 });
        }

        // Выбираем чат назначения в зависимости от типа файла
        const targetChatId = uploadType === "video" ? videoChatId : privateChatId;
        if (!targetChatId) {
            await fs.unlink(inputPath).catch(() => {});
            return NextResponse.json({ error: `Не задан чат назначения для типа: ${uploadType}` }, { status: 500 });
        }

        const stream = createReadStream(inputPath);
        const tgFormData = new globalThis.FormData();
        tgFormData.append('chat_id', targetChatId);
        
        const blob = await new Response(Readable.toWeb(stream) as any).blob();
        
        const prefixLabel = uploadType === "audio" ? "🎵 Track" : "🎥 Video";
        tgFormData.append('document', blob, originalName);
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
        console.error("🔥 [UPLOAD CRITICAL ERROR]:", error);
        return NextResponse.json(
            { error: error.message || "Ошибка при обработке файла" },
            { status: 500 }
        );
    }
}