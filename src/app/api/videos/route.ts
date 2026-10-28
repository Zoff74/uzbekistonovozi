export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;
// src/app/api/videos/route.ts
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

        const videos = await (Video as any).find(filter).populate('authorId', 'name email image').sort({ createdAt: -1 }).lean();

        const now = new Date();
        // Динамическая проверка срока действия для каждого видео
        const processedVideos = videos.map((video: any) => {
            const expiresAt = video.expiresAt ? new Date(video.expiresAt) : null;
            const isExpired = expiresAt && expiresAt < now;

            return {
                ...video,
                status: isExpired ? 'EXPIRED' : (video.status || 'ACTIVE'),
                isPaidActive: isExpired ? false : (video.isPaidActive ?? true),
                isExpired: Boolean(isExpired), // 👈 Флаг для фронтенда: нужно ли блюрить автора и закрывать скачивание
            };
        });

        return NextResponse.json({ success: true, videos: processedVideos }, {
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
        const rawUnlimitedIds = process.env.UNLIMITED_USER_IDS || "";
        const unlimitedIds = rawUnlimitedIds.split(",").map(id => id.trim()).filter(Boolean);
        const hasUnlimited = unlimitedIds.includes(userId.toString());

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

        let coverUrl = "/default-cover.webp";
        let coverFileId = "";

        if (coverInput instanceof File && coverInput.size > 0) {
            console.log("[VIDEO POST COVER] Загрузка обложки клипа в ImageKit (covers/clips)...");
            const coverBuffer = Buffer.from(await coverInput.arrayBuffer());
            const uniqueCoverName = `${Date.now()}_${coverInput.name.replace(/\s+/g, '_')}`;

            const uploadResponse: any = await imagekit.files.upload({
                file: coverBuffer.toString("base64"),
                fileName: uniqueCoverName,
                folder: "/uzbekistonovozi/covers/clips",
            });
            coverUrl = uploadResponse.url;
            coverFileId = uploadResponse.fileId || "";
            console.log("[VIDEO POST COVER] Успешно загружено в covers/clips:", coverUrl);
        } else if (typeof coverInput === 'string' && coverInput.trim() !== '') {
            coverUrl = coverInput;
        }

        const selectedGenre = genre || "Pop";
        const matchedCategory = await Category.findOne({ name: selectedGenre }).lean();

        let isTrial = false;
        let expiresAt = new Date();

        if (isAdmin || hasUnlimited) {
            expiresAt.setTime(Date.now() + 365 * 24 * 60 * 60 * 1000);
        } else if (!currentUser.hasUsedFreeVideo) {
            isTrial = true;
            expiresAt.setTime(Date.now() + 24 * 60 * 60 * 1000);
            currentUser.hasUsedFreeVideo = true;
            await currentUser.save();
        } else {
            const isPaid = formData.get("isPaid") === "true";
            if (!isPaid) {
                return NextResponse.json({
                    success: false,
                    message: tr(
                        "Бесплатный лимит видеоклипов исчерпан. Пожалуйста, оплатите размещение.",
                        "Bepul videolar limiti tugagan. Iltimos, to'lov qiling.",
                        "Бесплатный лимит видеоклипов исчерпан. Пожалуйста, оплатите размещение.",
                        "Free video limit exceeded. Please pay."
                    )
                }, { status: 402 });
            }
            expiresAt.setTime(Date.now() + 30 * 24 * 60 * 60 * 1000);
        }

        const cleanUserId = userId.toString();
        const authorObjectId = Types.ObjectId.isValid(cleanUserId) ? new Types.ObjectId(cleanUserId) : cleanUserId;

        const newVideo = await (Video as any).create({
            title,
            singer,
            genre: selectedGenre,
            categoryId: matchedCategory ? (matchedCategory as any)._id : undefined,
            duration,
            cover: coverUrl,
            coverFileId: coverFileId,
            videoUrl: videoUrlFromClient || `/api/videos/stream/${videoFileId}`,
            videoFileId: videoFileId,
            telegramMessageId: telegramMessageIdStr ? Number(telegramMessageIdStr) : undefined,
            authorId: authorObjectId,
            author: authorObjectId,
            userId: authorObjectId,
            status: 'ACTIVE',
            expiresAt: expiresAt,
            isPaidActive: isAdmin || hasUnlimited || !isTrial,
            views: 0,
            downloadsCount: 0,
        });

        console.log("[VIDEO POST SUCCESS] Видео сохранено в БД.");
        return NextResponse.json({ success: true, video: newVideo, isTrial }, { status: 201 });
    } catch (error: any) {
        console.error("[VIDEO POST ERROR] Ошибка:", error);
        return NextResponse.json({ success: false, message: error?.message || "Server error" }, { status: 500 });
    }
}