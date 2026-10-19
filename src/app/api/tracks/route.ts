import { NextResponse, NextRequest } from "next/server";
import { dbConnect } from "@/lib/mongoose";
import { Track } from "@/models/Track";
import Category from "@/models/Category";
import User from "@/models/User";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth.config";
import { Types } from "mongoose";
import { tr } from "@/utils/translate";

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 120;

export async function GET(req: NextRequest) {
    console.log("[TRACK GET] Запрос на получение списка треков получен");
    try {
        console.log("[TRACK GET] Подключение к базе данных...");
        await dbConnect();
        
        const searchParams = req.nextUrl.searchParams;
        const authorId = searchParams.get("author") || searchParams.get("userId");

        let filter: any = {};
        if (authorId) {
            filter.$or = [
                { authorId: authorId },
                { author: authorId },
                { userId: authorId }
            ];
            if (Types.ObjectId.isValid(authorId)) {
                filter.$or.push({ authorId: new Types.ObjectId(authorId) });
                filter.$or.push({ author: new Types.ObjectId(authorId) });
                filter.$or.push({ userId: new Types.ObjectId(authorId) });
            }
            console.log(`[TRACK GET] Фильтрация треков по автору: ${authorId}`);
        } else {
            console.log("[TRACK GET] Параметр автора не передан. Загрузка общего каталога треков (общий котел).");
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
            console.warn("[TRACK POST AUTH] Ошибка: Неавторизованный запрос или отсутствует ID пользователя");
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

        console.log("[TRACK POST FORMDATA] Чтение данных из FormData...");
        const formData = await req.formData();
        const title = formData.get("title") as string;
        const singer = formData.get("singer") as string;
        const genre = formData.get("genre") as string;
        const description = (formData.get("description") as string) || "";
        
        // Архитектурное изменение: обложка с ImageKit (URL), аудиофайл — через Telegram (URL или fileId)
        const coverUrlFromClient = formData.get("cover") as string;
        const audioUrlFromClient = formData.get("audioUrl") as string || formData.get("audio") as string;

        console.log(`[TRACK POST FORMDATA] Данные формы: title="${title}", singer="${singer}", genre="${genre}"`);

        if (!title || !singer || !audioUrlFromClient) {
            console.warn("[TRACK POST VALIDATION] Ошибка: Обязательные поля (название, исполнитель или аудиофайл) не заполнены");
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
        console.log(`[TRACK POST COVER] Используется ссылка на обложку (ImageKit): ${coverUrl}`);
        console.log(`[TRACK POST AUDIO] Используется аудиоресурс (Telegram): ${audioUrlFromClient}`);

        const selectedGenre = genre || "Pop";
        console.log(`[TRACK POST CATEGORY] Поиск категории для жанра: "${selectedGenre}"`);
        const matchedCategory = await Category.findOne({
            $or: [
                { name: selectedGenre },
                { slug: selectedGenre.toLowerCase() }
            ]
        }).lean();
        console.log(`[TRACK POST CATEGORY] Найдена категория ID: ${matchedCategory ? (matchedCategory as any)._id : 'не найдена'}`);

        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        console.log(`[TRACK POST EXPIRATION] Установлен общий срок жизни трека на сайте до: ${expiresAt}`);

        const cleanUserId = userId.toString();
        console.log(`[TRACK POST DB] Создание документа трека в базе данных MongoDB для автора: ${cleanUserId}`);

        const newTrack = await (Track as any).create({
            title,
            singer,
            genre: selectedGenre,
            description,
            categoryId: matchedCategory ? (matchedCategory as any)._id : undefined,
            cover: coverUrl,
            audioUrl: audioUrlFromClient,
            authorId: Types.ObjectId.isValid(cleanUserId) ? new Types.ObjectId(cleanUserId) : cleanUserId,
            status: 'ACTIVE',
            expiresAt: expiresAt,
            isPaidActive: isAdmin ? true : false,
            plays: 0,
            downloadsCount: 0,
        });
        console.log(`[TRACK POST DB] Трек успешно сохранен в БД. ID трека: ${newTrack._id}`);

        console.log("[TRACK POST SUCCESS] Запрос успешно завершен, возвращаем ответ клиенту.");
        return NextResponse.json({ success: true, track: newTrack }, { status: 201 });
    } catch (error: any) {
        console.error("[TRACK POST ERROR] Произошла критическая ошибка при создании трека:", error);
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