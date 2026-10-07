//src\app\api\categories\[id]\route.ts
import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongoose";
import Category from "@/models/Category";
import { Track, ITrack } from "@/models/Track";
import { Model } from "mongoose";
import { tr } from "@/utils/translate";
// Импортируем модель User, чтобы Mongoose знал, с чем делать populate
import "@/models/User"; 

const TrackModel = Track as unknown as Model<ITrack>;

interface RouteParams {
    params: Promise<{
        id: string;
    }>;
}

export async function GET(
    request: Request,
    { params }: RouteParams
) {
    try {
        await dbConnect();
        const { id } = await params;

        // 1. Ищем категорию по её _id
        const category = await Category.findById(id).lean();
        if (!category) {
            return NextResponse.json({ 
                error: tr(
                    "Категория топилмади",
                    "Kategoriya topilmadi",
                    "Категория не найдена",
                    "Category not found"
                ) 
            }, { status: 404 });
        }

        const genreRegex = new RegExp(`^${category.name}$`, "i");

        // 2. Ищем треки и подтягиваем данные автора через authorId (запрашиваем image, а не avatar)
        const tracks = await TrackModel.find({
            $or: [
                { categoryId: id },
                { genre: { $regex: genreRegex } }
            ]
        })
        .populate({
            path: "authorId",
            select: "occupation role image username"
        })
        .lean();

        // 3. Собираем уникальных исполнителей из треков с их реальными профессиями
        const singersMap = new Map();

        tracks.forEach((trItem: any) => {
            const singerName = trItem.singer ? trItem.singer.trim() : "";
            if (singerName && !singersMap.has(singerName)) {
                // authorId теперь содержит заполненный объект пользователя благодаря populate
                const author = trItem.authorId;
                
                // Берем кастомную профессию/роль, либо дефолт
                const authorOccupation = author?.occupation || author?.role || "Савдогар";
                
                singersMap.set(singerName, {
                    _id: author?._id ? author._id.toString() : (trItem.artistId || trItem.singerId ? (trItem.artistId || trItem.singerId).toString() : trItem._id.toString()),
                    name: singerName,
                    // ИСПРАВЛЕНО: используем author?.image вместо author?.avatar
                    avatar: trItem.singerAvatar || trItem.artistAvatar || author?.image || "", 
                    role: authorOccupation, 
                    occupation: authorOccupation
                });
            }
        });

        const singers = Array.from(singersMap.values());

        return NextResponse.json({
            name: category.name,
            singers: singers,
            tracks: tracks.map((trItem: any) => ({
                _id: trItem._id.toString(),
                title: trItem.title,
                singer: trItem.singer,
                artistId: (trItem.authorId?._id || trItem.authorId || trItem.artistId || trItem.singerId || "").toString(),
                genre: category.name,
                duration: trItem.duration || "3:00",
                cover: trItem.cover || "",
                audioUrl: trItem.audioUrl || ""
            }))
        });

    } catch (error) {
        console.error("Категория тафсилотларини олишда хатолик:", error);
        return NextResponse.json({ 
            error: tr(
                "Сервер хатолиги",
                "Server xatoligi",
                "Ошибка сервера",
                "Server error"
            ) 
        }, { status: 500 });
    }
}