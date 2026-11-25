"use client";
// src/context/PlayerContext.tsx
import React, { createContext, useContext, useState } from "react";

export interface Track {
    id?: string;
    _id?: string;
    title: string;
    singer: string;
    audioUrl: string;
    videoUrl?: string;
    videoFileId?: string;
    fileSize?: number;
    cover?: string;
}

interface PlayerContextType {
    currentTrack: Track | null;
    isPlaying: boolean;
    playlist: Track[];
    playTrack: (track: Track, queue?: Track[]) => void;
    togglePlay: () => void;
    setIsPlaying: (playing: boolean) => void;
    closePlayer: () => void;
    nextTrack: () => void;
    prevTrack: () => void;
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
    const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [playlist, setPlaylist] = useState<Track[]>([]);
    const [currentIndex, setCurrentIndex] = useState<number>(0);

    const playTrack = (track: Track, queue: Track[] = []) => {
        if (!track.audioUrl && !track.videoUrl && !track.videoFileId) {
            console.error("У трека нет ни audioUrl, ни videoUrl, ни videoFileId!", track);
            alert("Невозможно воспроизвести: медиафайл не найден");
            return;
        }
        const newPlaylist = queue.length > 0 ? queue : [track];
        setPlaylist(newPlaylist);
        const index = newPlaylist.findIndex((t) => (t.id || t._id) === (track.id || track._id));
        setCurrentIndex(index !== -1 ? index : 0);
        const sameTrack = currentTrack?.audioUrl === track.audioUrl && currentTrack?.videoUrl === track.videoUrl && currentTrack?.videoFileId === track.videoFileId;
        if (sameTrack) { setIsPlaying(!isPlaying); } else { setCurrentTrack(track); setIsPlaying(true); }
    };

    const togglePlay = () => { if (currentTrack) setIsPlaying(!isPlaying); };

    const closePlayer = () => { setIsPlaying(false); setCurrentTrack(null); setPlaylist([]); setCurrentIndex(0); };

    const nextTrack = () => {
        if (playlist.length === 0) return;
        const nextIndex = (currentIndex + 1) % playlist.length;
        setCurrentIndex(nextIndex); setCurrentTrack(playlist[nextIndex]); setIsPlaying(true);
    };

    const prevTrack = () => {
        if (playlist.length === 0) return;
        const prevIndex = (currentIndex - 1 + playlist.length) % playlist.length;
        setCurrentIndex(prevIndex); setCurrentTrack(playlist[prevIndex]); setIsPlaying(true);
    };

    return (
        <PlayerContext.Provider value={{ currentTrack, isPlaying, playlist, playTrack, togglePlay, setIsPlaying, closePlayer, nextTrack, prevTrack }}>
            {children}
        </PlayerContext.Provider>
    );
}

export function usePlayer() {
    const context = useContext(PlayerContext);
    if (!context) throw new Error("usePlayer должен использоваться внутри PlayerProvider");
    return context;
}