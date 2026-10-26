export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 120;

import { NextResponse, NextRequest } from "next/server";
import { dbConnect } from "@/lib/mongoose";
import { Track } from "@/models/Track";
import Category from "@/models/Category";
import User from "@/models/User";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth.config";
import { Types } from "mongoose";
import { tr } from "@/utils/translate";

export async function GET(req: NextRequest) {
    console.log("[TRACK GET] Запрос на получение списка треков получен");
    try {
        await dbConnect();
        
        const searchParams = req.nextUrl.searchParams;
        const authorId = searchParams.get("author") || searchParams.get("userId");

        let filter: any = {};
        if (authorId) {
            const conditions: any[] = [
                { authorId: authorId },
                { author: authorId },
                { userId: authorId }
            ];
            
            if (Types.ObjectId.isValid(authorId)) {
                conditions.push({ authorId: new Types.ObjectId(authorId) });
                conditions.push({ author: new Types.ObjectId(authorId) });
                conditions.push({ userId: new Types.ObjectId(authorId) });
            }
            
            filter = { $or: conditions };
        }
        
        const tracks = await (Track as any).find(filter).sort({ createdAt: -1 }).lean();
        return NextResponse.json({ success: true, tracks });
    } catch (error) {
        console.error("[TRACK GET ERROR] Ошибка при получении треков:", error);
        return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    console.log("[TRACK POST] Получен запрос на создание/загрузку нового трека");
    try {
        await dbConnect();

        const session = await getServerSession(authOptions);
        if (!session || !session.user || !(session.user as any).id) {
            return NextResponse.json({ 
                success: false, 
                message: tr(
                    "Авторизация талаб қилинади",
                    "Avtorizatsiya talab qilinadi",
                    "Требуется авторизация",
                    "Authorization required"
                ) 
            }, { status: 401 });
        }

        const userId = (session.user as any).id;
        const currentUser = await (User as any).findById(userId);
        if (!currentUser) {
            return NextResponse.json({ 
                success: false, 
                message: tr(
                    "Фойдаланувчи топилмади",
                    "Foydalanuvchi topilmadi",
                    "Пользователь не найден",
                    "User not found"
                ) 
            }, { status: 404 });
        }

        const isAdmin = currentUser.role === 'admin';
        const rawUnlimitedIds = process.env.UNLIMITED_USER_IDS || "";
        const unlimitedIds = rawUnlimitedIds.split(",").map(id => id.trim()).filter(Boolean);
        const hasUnlimited = unlimitedIds.includes(userId.toString());

        const formData = await req.formData();
        const title = formData.get("title") as string;
        const singer = formData.get("singer") as string;
        const genre = formData.get("genre") as string;
        const description = (formData.get("description") as string) || "";
        
        const coverUrlFromClient = formData.get("cover") as string;
        const coverFileId = (formData.get("coverFileId") as string) || "";
        
        const audioUrlFromClient = formData.get("audioUrl") as string || formData.get("audio") as string;
        let audioFileId = (formData.get("audioFileId") as string) || "";

        if (!title || !singer || !audioUrlFromClient) {
            return NextResponse.json({ 
                success: false, 
                message: tr(
                    "Барча мажбурий майдонларни тўлдиринг ва аудиофайлни танланг",
                    "Barcha majburiy maydonlarni to'ldiring va audiofaylni tanlang",
                    "Заполните все обязательные поля и выберите аудиофайл",
                    "Fill in all required fields and select an audio file"
                ) 
            }, { status: 400 });
        }

        // Если audioFileId не пришел отдельно, но зашит в audioUrl или сам является fileId
        if (!audioFileId) {
            if (audioUrlFromClient.includes("/api/tracks/stream/")) {
                audioFileId = audioUrlFromClient.split("/api/tracks/stream/")[1];
            } else if (!audioUrlFromClient.startsWith("http") && !audioUrlFromClient.startsWith("/")) {
                audioFileId = audioUrlFromClient;
            }
        }

        let coverUrl = coverUrlFromClient || "/default-cover.webp";
        const selectedGenre = genre || "Pop";

        const matchedCategory = await Category.findOne({
            $or: [
                { name: selectedGenre },
                { slug: selectedGenre.toLowerCase() }
            ]
        }).lean();

        let isTrial = false;
        let expiresAt = new Date();

        if (isAdmin || hasUnlimited) {
            expiresAt.setTime(Date.now() + 365 * 24 * 60 * 60 * 1000);
        } else if (!currentUser.hasUsedFreeTrack) {
            isTrial = true;
            expiresAt.setTime(Date.now() + 24 * 60 * 60 * 1000); // 24 часа
            currentUser.hasUsedFreeTrack = true;
            await currentUser.save();
        } else {
            const isPaid = formData.get("isPaid") === "true";
            if (!isPaid) {
                return NextResponse.json({
                    success: false,
                    error: tr(
                        "Бепул треклар жойлаштириш лимити тугаган. Эндиги трекларни жойлаштириш учун, тўлов қилиш керак",
                        "Bepul treklar joylashtirish limiti tugagan. Endigi treklarni joylashtirish uchun, to'lov qilish kerak.",
                        "Бесплатный лимит треков исчерпан. Пожалуйста, оплатите размещение.",
                        "Free track limit exceeded. Please pay for placement."
                    )
                }, { status: 402 });
            }
            expiresAt.setTime(Date.now() + 30 * 24 * 60 * 60 * 1000);
        }

        const cleanUserId = userId.toString();
        const authorObjectId = Types.ObjectId.isValid(cleanUserId) ? new Types.ObjectId(cleanUserId) : cleanUserId;

        // Создаем трек с точной фиксацией fileId для медиа и обложки
        const newTrack = await (Track as any).create({
            title,
            singer,
            genre: selectedGenre,
            description,
            categoryId: matchedCategory ? (matchedCategory as any)._id : undefined,
            cover: coverUrl,
            coverFileId: coverFileId,
            audioUrl: audioUrlFromClient,
            audioFileId: audioFileId,
            authorId: authorObjectId,
            author: authorObjectId,
            userId: authorObjectId,
            status: 'ACTIVE',
            expiresAt: expiresAt,
            isPaidActive: isAdmin || hasUnlimited || !isTrial,
            plays: 0,
            downloadsCount: 0,
        });

        console.log(`[TRACK POST DB] Трек успешно сохранен. ID: ${newTrack._id}, audioFileId: ${audioFileId}`);

        return NextResponse.json({ success: true, track: newTrack, isTrial }, { status: 201 });
    } catch (error: any) {
        console.error("[TRACK POST ERROR] Ошибка:", error);
        return NextResponse.json({ 
            success: false, 
            message: error.message || tr(
                "Сервер хатолиги",
                "Server xatoligi",
                "Ошибка сервера",
                "Server error"
            ) 
        }, { status: 500 });
    }
}