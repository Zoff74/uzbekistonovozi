'use server';
// src/actions/videoActions.ts
import { dbConnect } from "@/lib/mongoose";
import { Video } from "@/models/Video";
import User from "@/models/User";
import { revalidatePath } from "next/cache";
import ImageKit from "@imagekit/nodejs";

const imagekit = new ImageKit({
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY || "dummy_key",
});

interface CreateVideoInput {
    title: string;
    singer: string;
    genre?: string;
    duration?: string;
    videoUrl: string;
    videoFileId?: string;
    cover: string;
    coverFileId?: string;
    authorId: string;
}

export async function createVideoAction(data: CreateVideoInput) {
    try {
        await dbConnect();

        if (!data.title || !data.videoUrl || !data.authorId) {
            return { success: false, errorCode: "FIELD_REQUIRED" };
        }

        const user = await User.findById(data.authorId);
        if (!user) {
            return { success: false, errorCode: "USER_NOT_FOUND" };
        }

        const isAdmin = user.role === 'admin';
        const rawUnlimitedIds = process.env.UNLIMITED_USER_IDS || "";
        const unlimitedIds = rawUnlimitedIds.split(",").map(id => id.trim()).filter(Boolean);
        const hasUnlimited = unlimitedIds.includes(data.authorId.toString());

        let expiresAt = new Date();
        let isPaidActive = false;

        if (isAdmin || hasUnlimited) {
            expiresAt.setTime(Date.now() + 365 * 24 * 60 * 60 * 1000);
            isPaidActive = true;
        } else {
            expiresAt.setTime(Date.now() + 30 * 24 * 60 * 60 * 1000);
            isPaidActive = false;
        }

        const newVideo = new Video({
            title: data.title,
            singer: data.singer || "Номаълум ижрочи",
            genre: data.genre || "Clip",
            duration: data.duration || "0:00",
            videoUrl: data.videoUrl,
            videoFileId: data.videoFileId || "",
            cover: data.cover || "/default-cover.webp",
            coverFileId: data.coverFileId || "",
            authorId: data.authorId,
            status: 'ACTIVE',
            expiresAt: expiresAt, 
            isPaidActive: isPaidActive,
            views: 0,
            downloadsCount: 0,
        });

        await newVideo.save();

        revalidatePath('/videos');
        revalidatePath('/catalogVideos');
        revalidatePath('/dashboard');

        return {
            success: true,
            videoId: newVideo._id.toString(),
            messageCode: "VIDEO_CREATED_SUCCESS"
        };

    } catch (error: any) {
        console.error("Видео яратишда хатолик:", error);
        return { success: false, errorCode: "SERVER_ERROR" };
    }
}

interface UpdateVideoInput {
    videoId: string;
    title?: string;
    singer?: string;
    genre?: string;
    duration?: string;
    videoUrl?: string;
    videoFileId?: string;
    cover?: string;
    coverFileId?: string;
}

export async function updateVideoAction(data: UpdateVideoInput) {
    try {
        await dbConnect();

        if (!data.videoId) {
            return { success: false, errorCode: "VIDEO_ID_REQUIRED" };
        }

        // Явное приведение модели к типу any обходит конфликты перегрузок TypeScript в Mongoose
        const VideoModel: any = Video;

        const video = await VideoModel.findById(data.videoId);
        if (!video) {
            return { success: false, errorCode: "VIDEO_NOT_FOUND" };
        }

        // Если загружена новая обложка и у клипа была старая в ImageKit — стираем старую
        if (data.coverFileId && video.coverFileId && data.coverFileId !== video.coverFileId) {
            try {
                await imagekit.files.delete(video.coverFileId);
            } catch (err) {
                console.warn("Не удалось удалить старую обложку клипа из ImageKit:", err);
            }
        }

        // Если загружен новый видеофайл и был старый — стираем старый
        if (data.videoFileId && video.videoFileId && data.videoFileId !== video.videoFileId) {
            try {
                // Логика удаления старого видеофайла при необходимости
            } catch (err) {
                console.warn("Не удалось удалить старый видеофайл:", err);
            }
        }

        const updateFields: any = {};
        if (data.title !== undefined) updateFields.title = data.title;
        if (data.singer !== undefined) updateFields.singer = data.singer;
        if (data.genre !== undefined) updateFields.genre = data.genre;
        if (data.duration !== undefined) updateFields.duration = data.duration;
        if (data.videoUrl !== undefined) updateFields.videoUrl = data.videoUrl;
        if (data.videoFileId !== undefined) updateFields.videoFileId = data.videoFileId;
        if (data.cover !== undefined) updateFields.cover = data.cover;
        if (data.coverFileId !== undefined) updateFields.coverFileId = data.coverFileId;

        const updatedVideo = await VideoModel.findByIdAndUpdate(
            data.videoId,
            { $set: updateFields },
            { new: true }
        );

        revalidatePath('/videos');
        revalidatePath('/catalogVideos');
        revalidatePath('/dashboard');

        return {
            success: true,
            videoId: updatedVideo._id.toString(),
            messageCode: "VIDEO_UPDATED_SUCCESS"
        };

    } catch (error: any) {
        console.error("Видео янгилашда хатолик:", error);
        return { success: false, errorCode: "SERVER_ERROR" };
    }
}