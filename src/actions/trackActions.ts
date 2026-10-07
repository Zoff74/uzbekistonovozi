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

        // Общий срок жизни трека на сайте для публики — 30 дней
        const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        const newTrack = new Track({
            title: data.title,
            singer: data.singer || "Номаълум ижрочи", 
            genre: data.genre || "Pop",
            contentType: data.contentType || "song", 
            audioUrl: data.audioUrl,
            audioFileId: data.audioFileId || "",
            cover: data.cover || "/default-cover.webp",
            coverFileId: data.coverFileId || "",
            authorId: data.authorId,
            status: 'ACTIVE',
            expiresAt: thirtyDaysFromNow, // 30 дней публичной трансляции
            isPaidActive: false,
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