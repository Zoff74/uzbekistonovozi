//src\app\api\videos\route.ts
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

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
            console.log(`[VIDEO GET] Фильтрация видео по автору: ${authorId}`);
        } else {
            console.log("[VIDEO GET] Параметр автора не передан. Загрузка общего каталога видео.");
        }

        const videos = await (Video as any).find(filter).sort({ createdAt: -1 }).lean();
        console.log(`[VIDEO GET] Успешно получено видео: ${videos.length} шт.`);

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

        // Проверка безлимита из .env
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
        if (coverInput instanceof File && coverInput.size > 0) {
            console.log("[VIDEO POST COVER] Загрузка обложки в ImageKit...");
            const coverBuffer = Buffer.from(await coverInput.arrayBuffer());
            const uniqueCoverName = `${Date.now()}_${coverInput.name.replace(/\s+/g, '_')}`;

            const uploadResponse: any = await imagekit.files.upload({
                file: coverBuffer.toString("base64"),
                fileName: uniqueCoverName,
                folder: "/uzbekistonovozi/covers",
            });
            coverUrl = uploadResponse.url;
            console.log("[VIDEO POST COVER] Успешно загружено:", coverUrl);
        } else if (typeof coverInput === 'string' && coverInput.trim() !== '') {
            coverUrl = coverInput;
        }

        const selectedGenre = genre || "Pop";
        const matchedCategory = await Category.findOne({ name: selectedGenre }).lean();

        // --- ЛОГИКА ТРИАЛА И ОПЛАТЫ ДЛЯ ВИДЕО ---
        let isTrial = false;
        let expiresAt = new Date();

        if ((!currentUser.hasUsedFreeVideo && !isAdmin && !hasUnlimited) || (hasUnlimited && !currentUser.hasUsedFreeVideo)) {
            if (!hasUnlimited) {
                currentUser.hasUsedFreeVideo = true;
                await currentUser.save();
            }
            isTrial = !hasUnlimited;
            expiresAt.setTime(Date.now() + (hasUnlimited ? 365 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000)); // 24 часа или год
            console.log(`[VIDEO POST TRIAL] Пользователь ${userId} активировал бесплатный/безлимитный период для видео.`);
        } else {
            const isPaid = formData.get("isPaid") === "true" || isAdmin || hasUnlimited;

            if (!isPaid && !isAdmin && !hasUnlimited) {
                console.warn(`[VIDEO POST PAYMENT] Отказ: Лимит бесплатных видео исчерпан.`);
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

            expiresAt.setTime(Date.now() + (hasUnlimited ? 365 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000));
        }

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