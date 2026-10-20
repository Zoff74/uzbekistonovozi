import { NextResponse, NextRequest } from "next/server";
import { dbConnect } from "@/lib/mongoose";
import { Video } from "@/models/Video";
import Category from "@/models/Category";
import User from "@/models/User";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth.config";
import { Types } from "mongoose";
import { tr } from "@/utils/translate";
import ImageKit from "@imagekit/nodejs";

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

// Инициализация серверного ImageKit
const imagekit = new ImageKit({
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY || "dummy_private_key",
});

export async function GET(req: NextRequest) {
    console.log("[VIDEO GET] Запрос на получение списка видео получен");
    try {
        await dbConnect();

        const searchParams = req.nextUrl.searchParams;
        const authorId = searchParams.get("author") || searchParams.get("userId");

        let filter: any = {};

        if (authorId) {
            const authorOrConditions: any[] = [
                { authorId: authorId },
                { author: authorId },
                { userId: authorId }
            ];
            if (Types.ObjectId.isValid(authorId)) {
                authorOrConditions.push({ authorId: new Types.ObjectId(authorId) });
                authorOrConditions.push({ author: new Types.ObjectId(authorId) });
                authorOrConditions.push({ userId: new Types.ObjectId(authorId) });
            }
            filter.$or = authorOrConditions;
        }

        const videos = await (Video as any).find(filter).sort({ createdAt: -1 }).lean();

        return NextResponse.json({ success: true, videos }, {
            headers: {
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0',
            }
        });
    } catch (error) {
        console.error("[VIDEO GET ERROR] Ошибка при получении видео:", error);
        return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    console.log("[VIDEO POST] Получен запрос на сохранение метаданных нового видео в БД");
    try {
        await dbConnect();

        const session = await getServerSession(authOptions);
        if (!session || !session.user || !(session.user as any).id) {
            return NextResponse.json({ success: false, message: "Требуется авторизация" }, { status: 401 });
        }

        const userId = (session.user as any).id;
        const currentUser = await (User as any).findById(userId);
        if (!currentUser) {
            return NextResponse.json({ success: false, message: "Пользователь не найден" }, { status: 404 });
        }

        const isAdmin = currentUser.role === 'admin';
        const formData = await req.formData();

        const title = formData.get("title") as string;
        const singer = formData.get("singer") as string;
        const genre = formData.get("genre") as string;
        const duration = (formData.get("duration") as string) || "0:00";

        const coverInput = formData.get("cover"); 
        const videoFileId = formData.get("videoFileId") as string;
        const videoUrlFromClient = formData.get("videoUrl") as string;
        const telegramMessageIdStr = formData.get("telegramMessageId") as string;

        if (!title || !singer || !videoFileId) {
            return NextResponse.json({ success: false, message: "Заполните название, исполнителя и ID видео" }, { status: 400 });
        }

        // Автоматическая обработка обложки через imagekit.files.upload
        let coverUrl = "/default-cover.webp";
        if (coverInput instanceof File && coverInput.size > 0) {
            console.log("[VIDEO POST COVER] Обнаружен файл обложки, загружаем в ImageKit...");
            const coverBuffer = Buffer.from(await coverInput.arrayBuffer());
            const uniqueCoverName = `${Date.now()}_${coverInput.name.replace(/\s+/g, '_')}`;

            const uploadResponse: any = await imagekit.files.upload({
                file: coverBuffer.toString("base64"),
                fileName: uniqueCoverName,
                folder: "/uzbekistonovozi/covers",
            });
            coverUrl = uploadResponse.url;
            console.log("[VIDEO POST COVER] Обложка успешно загружена в ImageKit:", coverUrl);
        } else if (typeof coverInput === 'string' && coverInput.trim() !== '') {
            coverUrl = coverInput;
        }

        const selectedGenre = genre || "Pop";
        const matchedCategory = await Category.findOne({ name: selectedGenre }).lean();

        const newVideo = await (Video as any).create({
            title,
            singer,
            genre: selectedGenre,
            categoryId: matchedCategory ? (matchedCategory as any)._id : undefined,
            duration,
            cover: coverUrl,
            videoUrl: videoUrlFromClient || `/api/videos/stream/${videoFileId}`,
            videoFileId: videoFileId,
            telegramMessageId: telegramMessageIdStr ? Number(telegramMessageIdStr) : undefined,
            authorId: Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : userId,
            status: 'ACTIVE',
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            isPaidActive: isAdmin ? true : false,
            views: 0,
            downloadsCount: 0,
        });

        return NextResponse.json({ success: true, video: newVideo }, { status: 201 });
    } catch (error: any) {
        console.error("[VIDEO POST ERROR] Ошибка:", error);
        return NextResponse.json({ success: false, message: error?.message || "Server error" }, { status: 500 });
    }
}