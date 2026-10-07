// src/app/api/videos/route.ts
import { NextResponse, NextRequest } from "next/server";
import { dbConnect } from "@/lib/mongoose";
import { Video } from "@/models/Video";
import Category from "@/models/Category";
import User from "@/models/User";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth.config";
import { getGridFSBuckets } from "@/lib/gridfs"; // Импортируем GridFS хелпер
import { Readable } from "stream";
import { Types } from "mongoose";
import { tr } from "@/utils/translate";

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 120;

export async function GET() {
    console.log("[VIDEO GET] Запрос на получение списка видео получен");
    try {
        console.log("[VIDEO GET] Подключение к базе данных...");
        await dbConnect();
        
        console.log("[VIDEO GET] Запрос видео из MongoDB...");
        const videos = await (Video as any).find({}).lean();
        console.log(`[VIDEO GET] Успешно получено видео: ${videos.length} шт.`);
        
        return NextResponse.json({ success: true, videos });
    } catch (error) {
        console.error("[VIDEO GET ERROR] Ошибка при получении видео:", error);
        return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    console.log("[VIDEO POST] Получен запрос на создание/загрузку нового видео через GridFS");
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

        console.log("[VIDEO POST FORMDATA] Чтение данных из FormData...");
        const formData = await req.formData();
        const title = formData.get("title") as string;
        const singer = formData.get("singer") as string;
        const genre = formData.get("genre") as string;
        const duration = (formData.get("duration") as string) || "0:00";
        const coverFile = formData.get("cover") as File | null;
        const videoFile = formData.get("video") as File | null;

        console.log(`[VIDEO POST FORMDATA] Данные формы: title="${title}", singer="${singer}", genre="${genre}", duration="${duration}"`);
        console.log(`[VIDEO POST FORMDATA] Файлы: coverFile=${coverFile ? coverFile.name + ' (' + coverFile.size + ' bytes)' : 'отсутствует'}, videoFile=${videoFile ? videoFile.name + ' (' + videoFile.size + ' bytes)' : 'отсутствует'}`);

        if (!title || !singer || !videoFile) {
            console.warn("[VIDEO POST VALIDATION] Ошибка: Обязательные поля (название, исполнитель или видеофайл) не заполнены");
            return NextResponse.json({ 
                success: false, 
                message: tr(
                    "Сарлавҳа, ижрочи ва видеофайлни тўлдиринг",
                    "Sarlavha, ijrochi va videofaylni to'ldiring",
                    "Заполните название, исполнителя и видеофайл",
                    "Fill in the title, singer, and video file"
                ) 
            }, { status: 400 });
        }

        let coverUrl = "/default-cover.webp";
        let videoUrl = "";

        // Инициализируем GridFS bucket
        const { bucket } = await getGridFSBuckets();

        // 1. Загрузка обложки в GridFS
        if (coverFile && coverFile.size > 0) {
            console.log("[VIDEO POST COVER] Начало обработки обложки для GridFS...");
            const bytes = await coverFile.arrayBuffer();
            const buffer = Buffer.from(bytes);
            console.log(`[VIDEO POST COVER] Обложка сконвертирована в Buffer. Размер: ${buffer.length} байт`);

            const coverFilename = `video_cover_${Date.now()}_${coverFile.name.replace(/\s+/g, '_')}`;
            console.log(`[VIDEO POST COVER] Запись обложки в GridFS... Имя файла: ${coverFilename}`);

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
        } else {
            console.log("[VIDEO POST COVER] Обложка не передана, используется дефолтная.");
        }

        // 2. Загрузка видеофайла в GridFS
        if (videoFile && videoFile.size > 0) {
            console.log("[VIDEO POST VIDEO] Начало обработки видеофайла для GridFS...");
            const bytes = await videoFile.arrayBuffer();
            const buffer = Buffer.from(bytes);
            console.log(`[VIDEO POST VIDEO] Видеофайл сконвертирован в Buffer. Размер: ${buffer.length} байт`);

            const videoFilename = `video_${Date.now()}_${videoFile.name.replace(/\s+/g, '_')}`;
            console.log(`[VIDEO POST VIDEO] Запись видео в GridFS... Имя файла: ${videoFilename}`);

            const videoUploadStream = bucket.openUploadStream(videoFilename, {
                contentType: videoFile.type,
            });

            Readable.from(buffer).pipe(videoUploadStream);

            await new Promise((resolve, reject) => {
                videoUploadStream.on("finish", resolve);
                videoUploadStream.on("error", reject);
            });

            videoUrl = `/api/media/${videoUploadStream.id}`;
            console.log(`[VIDEO POST VIDEO] Видео успешно сохранено в GridFS. Ссылка: ${videoUrl}`);
        }

        const selectedGenre = genre || "Pop";
        console.log(`[VIDEO POST CATEGORY] Поиск категории для жанра: "${selectedGenre}"`);
        const matchedCategory = await Category.findOne({
            name: selectedGenre
        }).lean();
        console.log(`[VIDEO POST CATEGORY] Найденная категория ID: ${matchedCategory ? (matchedCategory as any)._id : 'не найдена (undefined)'}`);

        // Устанавливаем общий срок жизни видео на сайте — 30 дней
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        console.log(`[VIDEO POST EXPIRATION] Установлен общий срок жизни видео на сайте до: ${expiresAt}`);

        const cleanUserId = userId.toString();
        console.log(`[VIDEO POST DB] Создание документа видео в базе данных MongoDB для автора: ${cleanUserId}`);

        const newVideo = await (Video as any).create({
            title,
            singer,
            genre: selectedGenre,
            categoryId: matchedCategory ? (matchedCategory as any)._id : undefined,
            duration,
            cover: coverUrl,
            videoUrl: videoUrl,
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