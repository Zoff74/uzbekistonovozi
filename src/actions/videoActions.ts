'use server';
//src\actions\videoActions.ts
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
    cover: string;
    coverFileId?: string;
    authorId: string;
    videoFile?: File; // Обязательный файл видео с формы
}

export async function createVideoAction(formData: FormData) {
    try {
        await dbConnect();

        const title = formData.get("title") as string;
        const singer = formData.get("singer") as string;
        const genre = formData.get("genre") as string;
        const duration = formData.get("duration") as string;
        const cover = formData.get("cover") as string;
        const authorId = formData.get("authorId") as string;
        const videoFile = formData.get("videoFile") as File;

        if (!title || !authorId || !videoFile) {
            return { success: false, errorCode: "FIELD_REQUIRED" };
        }

        const user = await User.findById(authorId);
        if (!user) {
            return { success: false, errorCode: "USER_NOT_FOUND" };
        }

        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        const channelUsername = "uzbekistonovozi_video";

        if (!botToken) {
            return { success: false, errorCode: "BOT_TOKEN_NOT_CONFIGURED" };
        }

        // Загружаем видео в Telegram-канал
        const telegramFormData = new FormData();
        telegramFormData.append('chat_id', `@${channelUsername}`);
        telegramFormData.append('video', videoFile);
        telegramFormData.append('caption', `${singer} - ${title}`);
        telegramFormData.append('supports_streaming', 'true');

        const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendVideo`, {
            method: 'POST',
            body: telegramFormData,
        });

        const tgData = await tgRes.json();

        if (!tgData.ok || !tgData.result?.message_id) {
            console.error("Telegram upload error:", tgData);
            return { success: false, errorCode: "TELEGRAM_UPLOAD_FAILED" };
        }

        const messageId = tgData.result.message_id;
        const generatedTelegramUrl = `https://t.me/${channelUsername}/${messageId}`;

        const isAdmin = user.role === 'admin';
        const rawUnlimitedIds = process.env.UNLIMITED_USER_IDS || "";
        const unlimitedIds = rawUnlimitedIds.split(",").map(id => id.trim()).filter(Boolean);
        const hasUnlimited = unlimitedIds.includes(authorId.toString());

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
            title,
            singer: singer || "Номаълум ижрочи",
            genre: genre || "Clip",
            duration: duration || "3:45",
            telegramUrl: generatedTelegramUrl,
            videoUrl: generatedTelegramUrl,   
            cover: cover || "/default-cover.webp",
            authorId,
            status: 'ACTIVE',
            expiresAt, 
            isPaidActive,
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
    telegramUrl?: string;
    cover?: string;
    coverFileId?: string;
}

export async function updateVideoAction(data: UpdateVideoInput) {
    try {
        await dbConnect();

        if (!data.videoId) {
            return { success: false, errorCode: "VIDEO_ID_REQUIRED" };
        }

        const VideoModel: any = Video;

        const video = await VideoModel.findById(data.videoId);
        if (!video) {
            return { success: false, errorCode: "VIDEO_NOT_FOUND" };
        }

        if (data.coverFileId && video.coverFileId && data.coverFileId !== video.coverFileId) {
            try {
                await imagekit.files.delete(video.coverFileId);
            } catch (err) {
                console.warn("Не удалось удалить старую обложку клипа из ImageKit:", err);
            }
        }

        const updateFields: any = {};
        if (data.title !== undefined) updateFields.title = data.title;
        if (data.singer !== undefined) updateFields.singer = data.singer;
        if (data.genre !== undefined) updateFields.genre = data.genre;
        if (data.duration !== undefined) updateFields.duration = data.duration;
        if (data.telegramUrl !== undefined) {
            updateFields.telegramUrl = data.telegramUrl;
            updateFields.videoUrl = data.telegramUrl;
        }
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