'use server';
// src/actions/trackActions.ts
import { dbConnect } from "@/lib/mongoose"; 
import { Track } from "@/models/Track";
import User from "@/models/User";
import { revalidatePath } from "next/cache";

interface CreateTrackInput {
    title: string;
    singer: string; 
    genre: string;
    contentType?: 'music' | 'song'; 
    audioUrl: string;
    audioFileId?: string;
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

        // Расчет срока и статуса оплаты
        let expiresAt = new Date();
        let isPaidActive = false;

        if (isAdmin || hasUnlimited) {
            expiresAt.setTime(Date.now() + 365 * 24 * 60 * 60 * 1000);
            isPaidActive = true;
        } else {
            expiresAt.setTime(Date.now() + 30 * 24 * 60 * 60 * 1000);
            isPaidActive = false;
        }

        // ЗАЩИТА: Если вдруг клиент прислал путь с /api/videos/stream/, принудительно исправляем его на /api/tracks/stream/
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