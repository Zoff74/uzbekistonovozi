// src/app/api/videos/route.ts
import { NextResponse, NextRequest } from "next/server";
import { dbConnect } from "@/lib/mongoose";
import { Video } from "@/models/Video";
import Category from "@/models/Category";
import User from "@/models/User";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth.config";
import { getGridFSBuckets } from "@/lib/gridfs";
import { Readable } from "stream";
import { Types } from "mongoose";
import { tr } from "@/utils/translate";

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

export async function GET(req: NextRequest) {
    console.log("[VIDEO GET] Запрос на получение списка видео получен");
    try {
        console.log("[VIDEO GET] Подключение к базе данных...");
        await dbConnect();
        
        const searchParams = req.nextUrl.searchParams;
        const authorId = searchParams.get("author") || searchParams.get("userId");

        let filter: any = {};

        // Бронированная фильтрация без дублирования ключей
        filter.$and = [
            {
                $and: [
                    { videoUrl: { $exists: true,$ne: "" } },
                    { 
                        $or: [
                            { videoFileId: { $exists: true,$ne: "" } },
                            { fileId: { $exists: true,$ne: "" } },
                            { videoUrl: { $regex: /^\/api\/videos\/stream\// } },
                            { videoUrl: { $regex: /^https?:\/\// } }
                        ]
                    }
                ]
            }
        ];

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
            filter.$and.push({$or: authorOrConditions });
            console.log(`[VIDEO GET] Фильтрация видео по автору: ${authorId}`);
        } else {
            console.log("[VIDEO GET] Параметр автора не передан. Загрузка общего каталога видео (общий котел).");
        }
        
        console.log("[VIDEO GET] Запрос видео из MongoDB...");
        const videos = await (Video as any).find(filter).sort({ createdAt: -1 }).lean();
        console.log(`[VIDEO GET] Успешно получено валидных видео: ${videos.length} шт.`);
        
        return NextResponse.json({ success: true, videos });
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
        const coverFile = formData.get("cover") as File | null;
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

        let coverUrl = "/default-cover.webp";
        const { bucket } = await getGridFSBuckets();

        // 1. Обработка обложки (картинки маленькие, храним в GridFS)
        if (coverFile && coverFile.size > 0) {
            console.log("[VIDEO POST COVER] Начало обработки обложки для GridFS...");
            const bytes = await coverFile.arrayBuffer();
            const buffer = Buffer.from(bytes);
            
            const coverFilename = `video_cover_${Date.now()}_${coverFile.name.replace(/\s+/g, '_')}`;
            const coverUploadStream = bucket.openUploadStream(coverFilename, {
                contentType: coverFile.type,
            });

            Readable.from(buffer).pipe(coverUploadStream);

            await new Promise((resolve, reject) => {
                coverUploadStream.on("finish", resolve);
                coverUploadStream.on("error", reject);
            });

            coverUrl = `/api/media/${coverUploadStream.id}`;
            console.log(`[VIDEO POST COVER] Обложка успешно сохранена в GridFS. Ссылка: ${coverUrl}`);
        }

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
            videoFileId: videoFileId, // Сохраняем Telegram file_id
            telegramMessageId: telegramMessageIdStr ? Number(telegramMessageIdStr) : undefined, // 👈 Сохраняем ID сообщения для удаления из котла
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