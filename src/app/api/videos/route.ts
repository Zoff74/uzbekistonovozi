import { NextResponse, NextRequest } from "next/server";
import { dbConnect } from "@/lib/mongoose";
import { Video } from "@/models/Video";
import Category from "@/models/Category";
import User from "@/models/User";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth.config";
import { Types } from "mongoose";
import { tr } from "@/utils/translate";

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

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
        console.log("[VIDEO POST] Подключение к базе данных...");
        await dbConnect();

        console.log("[VIDEO POST] Проверка сессии пользователя...");
        const session = await getServerSession(authOptions);
        if (!session || !session.user || !(session.user as any).id) {
            console.warn("[VIDEO POST AUTH] Ошибка: Неавторизованный запрос или отсутствует ID пользователя");
            return NextResponse.json({ 
                success: false, 
                message: tr(
                    "Авторизация талаб этилади",
                    "Avtorizatsiya talab etiladi",
                    "Требуется авторизация",
                    "Authorization required"
                ) 
            }, { status: 401 });
        }

        const userId = (session.user as any).id;
        console.log(`[VIDEO POST AUTH] Пользователь авторизован. ID: ${userId}`);

        console.log("[VIDEO POST USER] Поиск пользователя в базе данных...");
        const currentUser = await (User as any).findById(userId);
        if (!currentUser) {
            console.warn(`[VIDEO POST USER] Ошибка: Пользователь с ID ${userId} не найден в БД`);
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
        console.log(`[VIDEO POST USER] Роль: ${currentUser.role}, Администратор: ${isAdmin}`);

        console.log("[VIDEO POST FORMDATA] Чтение метаданных, fileId и telegramMessageId из формы...");
        const formData = await req.formData();
        const title = formData.get("title") as string;
        const singer = formData.get("singer") as string;
        const genre = formData.get("genre") as string;
        const duration = (formData.get("duration") as string) || "0:00";
        
        // Архитектурное изменение: обложка через ImageKit, видео — через Telegram
        const coverUrlFromClient = formData.get("cover") as string;
        const videoFileId = formData.get("videoFileId") as string;
        const videoUrlFromClient = formData.get("videoUrl") as string;
        const telegramMessageIdStr = formData.get("telegramMessageId") as string;

        console.log(`[VIDEO POST FORMDATA] Данные: title="${title}", singer="${singer}", genre="${genre}", duration="${duration}", videoFileId="${videoFileId}", telegramMessageId="${telegramMessageIdStr}"`);

        if (!title || !singer || !videoFileId) {
            console.warn("[VIDEO POST VALIDATION] Ошибка: Обязательные поля (название, исполнитель или videoFileId) не заполнены");
            return NextResponse.json({ 
                success: false, 
                message: tr(
                    "Сарлавҳа, ижрочи ва видео идентификатори тўлдиринг",
                    "Sarlavha, ijrochi va video identifikatori to'ldiring",
                    "Заполните название, исполнителя и ID видео",
                    "Fill in the title, singer, and video ID"
                ) 
            }, { status: 400 });
        }

        const coverUrl = coverUrlFromClient || "/default-cover.webp";
        console.log(`[VIDEO POST COVER] Используется ссылка на обложку (ImageKit): ${coverUrl}`);

        const selectedGenre = genre || "Pop";
        console.log(`[VIDEO POST CATEGORY] Поиск категории для жанра: "${selectedGenre}"`);
        const matchedCategory = await Category.findOne({
            name: selectedGenre
        }).lean();

        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        const cleanUserId = userId.toString();

        console.log(`[VIDEO POST DB] Создание документа видео в базе данных MongoDB для автора: ${cleanUserId}`);

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
            authorId: Types.ObjectId.isValid(cleanUserId) ? new Types.ObjectId(cleanUserId) : cleanUserId,
            status: 'ACTIVE',
            expiresAt: expiresAt,
            isPaidActive: isAdmin ? true : false,
            views: 0,
            downloadsCount: 0,
        });

        console.log(`[VIDEO POST DB] Видео успешно сохранено в БД. ID видео: ${newVideo._id}`);
        console.log("[VIDEO POST SUCCESS] Запрос успешно завершен, возвращаем ответ клиенту.");
        
        return NextResponse.json({ success: true, video: newVideo }, { status: 201 });
    } catch (error: any) {
        console.error("[VIDEO POST ERROR] Произошла критическая ошибка при создании клипа:", error);
        const errorMessage = typeof error?.message === 'string' ? error.message : "Unknown server error";
        return NextResponse.json({ success: false, message: errorMessage }, { status: 500 });
    }
}