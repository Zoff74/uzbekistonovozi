export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 300; // До 5 минут ожидания для тяжелых видео
export const runtime = 'nodejs';

import { NextResponse, NextRequest } from "next/server";
import ImageKit from "imagekit";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth.config";
import { dbConnect } from "@/lib/mongoose";
import { Video } from "@/models/Video";
import { Track } from "@/models/Track";
import { uploadVideoToTelegramStorage } from "@/actions/telegram.action";

const imagekit = new ImageKit({
    publicKey: process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY || "",
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY || "",
    urlEndpoint: process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT || "",
});

export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user || !(session.user as any).id) {
            return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
        }

        const contentType = request.headers.get("content-type") || "";
        const uploadType = request.headers.get("x-upload-type") || "video";

        let buffer: Buffer;
        let originalName = "video.mp4";
        let oldFileId: string | null = null;

        // Если это обычные картинки/обложки (через formData), обрабатываем стандартно
        if (contentType.includes("multipart/form-data") && uploadType !== "video") {
            const formData = await request.formData();
            const file = formData.get("file") as File | null;
            oldFileId = formData.get("oldFileId") as string | null;

            if (!file) {
                return NextResponse.json({ error: "Файл не передан" }, { status: 400 });
            }

            originalName = file.name || "media";
            buffer = Buffer.from(await file.arrayBuffer());

            const uniqueFileName = `${Date.now()}_${originalName}`;
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
        
        // Для тяжелых ВИДЕО принимаем поток байтов напрямую из тела запроса (в обход лимитов formData и 413 ошибок)
        const arrayBuffer = await request.arrayBuffer();
        buffer = Buffer.from(arrayBuffer);
        
        const headerName = request.headers.get("x-file-name");
        if (headerName) {
            try {
                originalName = decodeURIComponent(headerName);
            } catch {
                originalName = headerName;
            }
        }

        if (buffer.length === 0) {
            return NextResponse.json({ error: "Файл пустой или не передан" }, { status: 400 });
        }

        const tgResult = await uploadVideoToTelegramStorage(
            buffer,
            originalName,
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
            { error: error.message || "Ошибка при загрузке файла" },
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