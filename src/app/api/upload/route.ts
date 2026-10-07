// src/app/api/upload/route.ts
export const dynamic = 'force-dynamic';
export const revalidate = 0;
import { NextResponse, NextRequest } from "next/server";
import ImageKit from "imagekit";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth.config";
import { dbConnect } from "@/lib/mongoose";
import { Video } from "@/models/Video";
import { Track } from "@/models/Track";

const imagekit = new ImageKit({
    publicKey: process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY || "",
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY || "",
    urlEndpoint: process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT || "",
});

// 1. Обработка POST-запросов (Загрузка файлов / аватаров в ImageKit)
export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user || !(session.user as any).id) {
            return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
        }

        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        const oldFileId = formData.get("oldFileId") as string | null;

        if (!file) {
            return NextResponse.json({ error: "Файл не передан" }, { status: 400 });
        }

        // Генерируем уникальное имя файла на основе миллисекунд (createdAt)
        const originalName = file.name || "avatar";
        const uniqueFileName = `${Date.now()}_${originalName}`;

        const mainFolder = process.env.NEXT_PUBLIC_IMAGEKIT_FOLDER || "";
        const defaultFolder = mainFolder ? `/${mainFolder}/avatars` : "/avatars";
        const folder = (formData.get("folder") as string) || defaultFolder;

        // Конвертируем файл в Buffer для загрузки в ImageKit
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        const uploadResponse = await imagekit.upload({
            file: buffer,
            fileName: uniqueFileName,
            folder: folder,
        });

        // Жестко удаляем старый файл из ImageKit, чтобы не оставлять мусор в хранилище
        if (oldFileId) {
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
    } catch (error: any) {
        console.error("ImageKit upload error:", error);
        return NextResponse.json(
            { error: error.message || "Ошибка при загрузке файла" },
            { status: 500 }
        );
    }
}

// 2. Обработка DELETE-запросов (Удаление файлов)
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

        // Если пользователь не админ, проверяем владение файлом в базе данных
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

            const videoResults = await (Video as any).find({
                authorId: userId,
                $or: orConditions
            }).limit(1).lean();

            let ownedItem = videoResults[0];

            if (!ownedItem) {
                const trackResults = await (Track as any).find({
                    authorId: userId,
                    $or: orConditions
                }).limit(1).lean();
                ownedItem = trackResults[0];
            }

            if (!ownedItem) {
                return NextResponse.json({ error: "Доступ запрещен. Вы не автор этого файла." }, { status: 403 });
            }
        }

        // Если это админ или подтвержденный владелец — удаляем файл из ImageKit
        if (fileId) {
            await imagekit.deleteFile(fileId);
        }

        return NextResponse.json({ success: true, message: "Файл успешно удален из хранилища" });
    } catch (error: any) {
        console.error("ImageKit delete error:", error);
        return NextResponse.json(
            { error: error.message || "Ошибка при удалении файла" },
            { status: 500 }
        );
    }
}