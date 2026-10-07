import { NextResponse, NextRequest } from "next/server";
import { dbConnect } from "@/lib/mongoose";
import { Track } from "@/models/Track";
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
export const maxDuration = 120;

export async function GET() {
    console.log("[TRACK GET] Запрос на получение списка треков получен");
    try {
        console.log("[TRACK GET] Подключение к базе данных...");
        await dbConnect();
        
        console.log("[TRACK GET] Запрос треков из MongoDB...");
        const tracks = await (Track as any).find({}).lean();
        console.log(`[TRACK GET] Успешно получено треков: ${tracks.length} шт.`);
        
        return NextResponse.json({ success: true, tracks });
    } catch (error) {
        console.error("[TRACK GET ERROR] Ошибка при получении треков:", error);
        return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    console.log("[TRACK POST] Получен запрос на создание/загрузку нового трека через GridFS");
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
        const coverFile = formData.get("cover") as File | null;
        const audioFile = formData.get("audio") as File | null;

        console.log(`[TRACK POST FORMDATA] Данные формы: title="${title}", singer="${singer}", genre="${genre}"`);
        console.log(`[TRACK POST FORMDATA] Файлы: coverFile=${coverFile ? coverFile.name + ' (' + coverFile.size + ' bytes)' : 'отсутствует'}, audioFile=${audioFile ? audioFile.name + ' (' + audioFile.size + ' bytes)' : 'отсутствует'}`);

        if (!title || !singer || !audioFile) {
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

        let coverUrl = "/default-cover.webp";
        let audioUrl = "";

        // Инициализируем GridFS bucket
        const { bucket } = await getGridFSBuckets();

        // 1. Загрузка обложки в GridFS
        if (coverFile && coverFile.size > 0) {
            console.log("[TRACK POST COVER] Начало обработки обложки для GridFS...");
            const coverBuffer = Buffer.from(await coverFile.arrayBuffer());
            const coverFilename = `track_cover_${Date.now()}_${coverFile.name.replace(/\s+/g, '_')}`;
            console.log(`[TRACK POST COVER] Запись обложки в GridFS... Имя файла: ${coverFilename}`);

            const coverUploadStream = bucket.openUploadStream(coverFilename, {
                contentType: coverFile.type,
            });

            Readable.from(coverBuffer).pipe(coverUploadStream);

            await new Promise((resolve, reject) => {
                coverUploadStream.on("finish", resolve);
                coverUploadStream.on("error", reject);
            });

            coverUrl = `/api/media/${coverUploadStream.id}`;
            console.log(`[TRACK POST COVER] Обложка успешно сохранена в GridFS. Ссылка: ${coverUrl}`);
        } else {
            console.log("[TRACK POST COVER] Обложка не передана, используется дефолтная.");
        }

        // 2. Загрузка аудиофайла в GridFS
        if (audioFile && audioFile.size > 0) {
            console.log("[TRACK POST AUDIO] Начало обработки аудиофайла для GridFS...");
            const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
            const audioFilename = `audio_${Date.now()}_${audioFile.name.replace(/\s+/g, '_')}`;
            console.log(`[TRACK POST AUDIO] Запись аудио в GridFS... Имя файла: ${audioFilename}`);

            const audioUploadStream = bucket.openUploadStream(audioFilename, {
                contentType: audioFile.type,
            });

            Readable.from(audioBuffer).pipe(audioUploadStream);

            await new Promise((resolve, reject) => {
                audioUploadStream.on("finish", resolve);
                audioUploadStream.on("error", reject);
            });

            audioUrl = `/api/media/${audioUploadStream.id}`;
            console.log(`[TRACK POST AUDIO] Аудио успешно сохранено в GridFS. Ссылка: ${audioUrl}`);
        }

        const selectedGenre = genre || "Pop";
        console.log(`[TRACK POST CATEGORY] Поиск категории для жанра: "${selectedGenre}"`);
        const matchedCategory = await Category.findOne({
            $or: [
                { name: selectedGenre },
                { slug: selectedGenre.toLowerCase() }
            ]
        }).lean();
        console.log(`[TRACK POST CATEGORY] Найдена категория ID: ${matchedCategory ? (matchedCategory as any)._id : 'не найдена'}`);

        // Устанавливаем общий срок жизни контента на сайте — 30 дней (чтобы контент наполнял каталог)
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
            audioUrl: audioUrl,
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