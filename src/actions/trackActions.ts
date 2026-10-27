'use server';
// src/actions/trackActions.ts
import { dbConnect } from "@/lib/mongoose"; 
import { Track } from "@/models/Track";
import User from "@/models/User";
import { revalidatePath } from "next/cache";
import ImageKit from "@imagekit/nodejs";

const imagekit = new ImageKit({
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY || "dummy_key",
});

interface CreateTrackInput {
    title: string;
    singer: string; 
    genre: string;
    contentType?: 'music' | 'song'; 
    audioUrl: string;
    audioFileId?: string;
    telegramMessageId?: number; // 👈 Добавлено
    telegramChatId?: string;    // 👈 Добавлено
    cover: string;
    coverFileId?: string;
    authorId: string;
}

export async function createTrackAction(data: CreateTrackInput) {
    try {
        await dbConnect(); 
        if (!data.title || !data.audioUrl || !data.authorId) {
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

        let fixedAudioUrl = data.audioUrl;
        if (fixedAudioUrl.includes("/api/videos/stream/")) {
            fixedAudioUrl = fixedAudioUrl.replace("/api/videos/stream/", "/api/tracks/stream/");
        }

        const newTrack = new Track({
            title: data.title,
            singer: data.singer || "Номаълум ижрочи", 
            genre: data.genre || "Pop",
            contentType: data.contentType || "song", 
            audioUrl: fixedAudioUrl,
            audioFileId: data.audioFileId || "",
            telegramMessageId: data.telegramMessageId || undefined, // 👈 Сохраняем ID сообщения
            telegramChatId: data.telegramChatId || process.env.TELEGRAM_CHANNEL_ID || "", // 👈 Сохраняем чат
            cover: data.cover || "/default-cover.webp",
            coverFileId: data.coverFileId || "",
            authorId: data.authorId,
            status: 'ACTIVE',
            expiresAt: expiresAt, 
            isPaidActive: isPaidActive,
            plays: 0,
            downloadsCount: 0,
        });

        await newTrack.save();
        
        revalidatePath('/tracks');
        revalidatePath('/catalogMusic');
        revalidatePath('/catalogSongs');
        revalidatePath('/dashboard');

        return { 
            success: true, 
            trackId: newTrack._id.toString(),
            messageCode: "TRACK_CREATED_SUCCESS" 
        };

    } catch (error: any) {
        console.error("Трек яратишда хатолик:", error);
        return { success: false, errorCode: "SERVER_ERROR" };
    }
}

interface UpdateTrackInput {
    trackId: string;
    title?: string;
    singer?: string;
    genre?: string;
    contentType?: 'music' | 'song';
    audioUrl?: string;
    audioFileId?: string;
    telegramMessageId?: number; // 👈 Добавлено на случай обновления
    telegramChatId?: string;    // 👈 Добавлено на случай обновления
    cover?: string;
    coverFileId?: string;
}

export async function updateTrackAction(data: UpdateTrackInput) {
    try {
        await dbConnect();

        if (!data.trackId) {
            return { success: false, errorCode: "TRACK_ID_REQUIRED" };
        }

        // Явное приведение модели к типу any убирает конфликт перегрузок TypeScript
        const TrackModel: any = Track;

        const track = await TrackModel.findById(data.trackId);
        if (!track) {
            return { success: false, errorCode: "TRACK_NOT_FOUND" };
        }

        // Если загружена новая обложка и у трека была старая в ImageKit — стираем старую
        if (data.coverFileId && track.coverFileId && data.coverFileId !== track.coverFileId) {
            try {
                await imagekit.files.delete(track.coverFileId);
            } catch (err) {
                console.warn("Не удалось удалить старую обложку трека из ImageKit:", err);
            }
        }

        // Если загружен новый аудиофайл и был старый — стираем старый
        if (data.audioFileId && track.audioFileId && data.audioFileId !== track.audioFileId) {
            try {
                // Логика удаления старого аудио, если требуется
            } catch (err) {
                console.warn("Не удалось удалить старый аудиофайл:", err);
            }
        }

        let fixedAudioUrl = data.audioUrl !== undefined ? data.audioUrl : track.audioUrl;
        if (fixedAudioUrl && fixedAudioUrl.includes("/api/videos/stream/")) {
            fixedAudioUrl = fixedAudioUrl.replace("/api/videos/stream/", "/api/tracks/stream/");
        }

        const updateFields: any = {};
        if (data.title !== undefined) updateFields.title = data.title;
        if (data.singer !== undefined) updateFields.singer = data.singer;
        if (data.genre !== undefined) updateFields.genre = data.genre;
        if (data.contentType !== undefined) updateFields.contentType = data.contentType;
        if (fixedAudioUrl !== undefined) updateFields.audioUrl = fixedAudioUrl;
        if (data.audioFileId !== undefined) updateFields.audioFileId = data.audioFileId;
        if (data.telegramMessageId !== undefined) updateFields.telegramMessageId = data.telegramMessageId; // 👈 Добавлено
        if (data.telegramChatId !== undefined) updateFields.telegramChatId = data.telegramChatId;       // 👈 Добавлено
        if (data.cover !== undefined) updateFields.cover = data.cover;
        if (data.coverFileId !== undefined) updateFields.coverFileId = data.coverFileId;

        const updatedTrack = await TrackModel.findByIdAndUpdate(
            data.trackId,
            { $set: updateFields },
            { new: true }
        );

        revalidatePath('/tracks');
        revalidatePath('/catalogMusic');
        revalidatePath('/catalogSongs');
        revalidatePath('/dashboard');

        return {
            success: true,
            trackId: updatedTrack._id.toString(),
            messageCode: "TRACK_UPDATED_SUCCESS"
        };

    } catch (error: any) {
        console.error("Трекни янгилашда хатолик:", error);
        return { success: false, errorCode: "SERVER_ERROR" };
    }
}