'use server';
// src/actions/videoActions.ts
import { dbConnect } from "@/lib/mongoose";
import { Video } from "@/models/Video";
import User from "@/models/User";
import { revalidatePath } from "next/cache";

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

        // Общий срок жизни видео на сайте для публики — 30 дней
        const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

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
            expiresAt: thirtyDaysFromNow, // 30 дней публичной трансляции
            isPaidActive: false,
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