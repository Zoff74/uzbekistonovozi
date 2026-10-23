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
        console.log("[TRACK GET] Подключение к базе данных...");
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
            console.log(`[TRACK GET] Фильтрация треков по автору: ${authorId}`);
        } else {
            console.log("[TRACK GET] Параметр автора не передан. Загрузка общего каталога треков.");
        }
        
        console.log("[TRACK GET] Запрос треков из MongoDB...");
        const tracks = await (Track as any).find(filter).sort({ createdAt: -1 }).lean();
        console.log(`[TRACK GET] Успешно получено треков: ${tracks.length} шт.`);
        
        return NextResponse.json({ success: true, tracks });
    } catch (error) {
        console.error("[TRACK GET ERROR] Ошибка при получении треков:", error);
        return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    console.log("[TRACK POST] Получен запрос на создание/загрузку нового трека");
    try {
        console.log("[TRACK POST] Подключение к базе данных...");
        await dbConnect();

        console.log("[TRACK POST] Проверка сессии пользователя...");
        const session = await getServerSession(authOptions);
        if (!session || !session.user || !(session.user as any).id) {
            console.warn("[TRACK POST AUTH] Ошибка: Неавторизованный запрос");
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
        console.log(`[TRACK POST AUTH] Пользователь авторизован. ID: ${userId}`);

        console.log("[TRACK POST USER] Поиск пользователя в базе данных...");
        const currentUser = await (User as any).findById(userId);
        if (!currentUser) {
            console.warn(`[TRACK POST USER] Ошибка: Пользователь с ID ${userId} не найден в БД`);
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
        console.log(`[TRACK POST USER] Роль: ${currentUser.role}, Администратор: ${isAdmin}`);

        // Проверка безлимита из .env
        const rawUnlimitedIds = process.env.UNLIMITED_USER_IDS || "";
        const unlimitedIds = rawUnlimitedIds.split(",").map(id => id.trim()).filter(Boolean);
        const hasUnlimited = unlimitedIds.includes(userId.toString());
        console.log(`[TRACK POST UNLIMITED] Безлимит по .env для пользователя: ${hasUnlimited}`);

        console.log("[TRACK POST FORMDATA] Чтение данных из FormData...");
        const formData = await req.formData();
        const title = formData.get("title") as string;
        const singer = formData.get("singer") as string;
        const genre = formData.get("genre") as string;
        const description = (formData.get("description") as string) || "";
        
        const coverUrlFromClient = formData.get("cover") as string;
        const audioUrlFromClient = formData.get("audioUrl") as string || formData.get("audio") as string;

        console.log(`[TRACK POST FORMDATA] Данные формы: title="${title}", singer="${singer}", genre="${genre}"`);

        if (!title || !singer || !audioUrlFromClient) {
            console.warn("[TRACK POST VALIDATION] Ошибка: Обязательные поля не заполнены");
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

        let coverUrl = coverUrlFromClient || "/default-cover.webp";
        console.log(`[TRACK POST COVER] Обложка: ${coverUrl}`);
        console.log(`[TRACK POST AUDIO] Аудио: ${audioUrlFromClient}`);

        const selectedGenre = genre || "Pop";
        console.log(`[TRACK POST CATEGORY] Поиск категории для жанра: "${selectedGenre}"`);
        const matchedCategory = await Category.findOne({
            $or: [
                { name: selectedGenre },
                { slug: selectedGenre.toLowerCase() }
            ]
        }).lean();
        console.log(`[TRACK POST CATEGORY] Категория ID: ${matchedCategory ? (matchedCategory as any)._id : 'не найдена'}`);

        // --- ЛОГИКА ТРИАЛА И ОПЛАТЫ ДЛЯ ТРЕКА ---
        let isTrial = false;
        let expiresAt = new Date();

        if (isAdmin || hasUnlimited) {
            // Администраторам и безлимитным пользователям ставим год без триалов
            expiresAt.setTime(Date.now() + 365 * 24 * 60 * 60 * 1000);
            console.log(`[TRACK POST ADMIN/UNLIMITED] Пользователь имеет полный безлимит.`);
        } else if (!currentUser.hasUsedFreeTrack) {
            isTrial = true;
            expiresAt.setTime(Date.now() + 24 * 60 * 60 * 1000); // 24 часа

            currentUser.hasUsedFreeTrack = true;
            await currentUser.save();
            console.log(`[TRACK POST TRIAL] Пользователь ${userId} активировал бесплатный 24-часовой триал.`);
        } else {
            const isPaid = formData.get("isPaid") === "true";
            
            if (!isPaid) {
                console.warn(`[TRACK POST PAYMENT] Отказ: Лимит бесплатных треков исчерпан.`);
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

        console.log(`[TRACK POST DB] Создание документа трека для автора: ${cleanUserId}`);

        // ЖЕСТКО дублируем во все возможные поля автора, чтобы в базе данные никогда не терялись
        const newTrack = await (Track as any).create({
            title,
            singer,
            genre: selectedGenre,
            description,
            categoryId: matchedCategory ? (matchedCategory as any)._id : undefined,
            cover: coverUrl,
            audioUrl: audioUrlFromClient,
            authorId: authorObjectId,
            author: authorObjectId,
            userId: authorObjectId,
            status: 'ACTIVE',
            expiresAt: expiresAt,
            isPaidActive: isAdmin || hasUnlimited || !isTrial,
            plays: 0,
            downloadsCount: 0,
        });
        console.log(`[TRACK POST DB] Трек успешно сохранен. ID: ${newTrack._id}`);

        console.log("[TRACK POST SUCCESS] Запрос завершен.");
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