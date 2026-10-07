"use client";

//src\context\PlayerContext.tsx
import React, { createContext, useContext, useState } from "react";

interface Track {
    id?: string;
    _id?: string;
    title: string;
    singer: string;
    audioUrl: string;
    videoUrl?: string; // Ссылка на видеоклип (если есть)
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
        if (!track.audioUrl && !track.videoUrl) {
            console.error("У трека нет ни audioUrl, ни videoUrl!");
            return;
        }

        const newPlaylist = queue.length > 0 ? queue : [track];
        setPlaylist(newPlaylist);

        const index = newPlaylist.findIndex((t) => (t.id || t._id) === (track.id || track._id));
        setCurrentIndex(index !== -1 ? index : 0);

        if (currentTrack?.audioUrl === track.audioUrl && currentTrack?.videoUrl === track.videoUrl) {
            setIsPlaying(!isPlaying);
        } else {
            setCurrentTrack(track);
            setIsPlaying(true);
        }
    };

    const togglePlay = () => {
        if (!currentTrack) return;
        setIsPlaying(!isPlaying);
    };

    const closePlayer = () => {
        setIsPlaying(false);
        setCurrentTrack(null);
        setPlaylist([]);
        setCurrentIndex(0);
    };

    const nextTrack = () => {
        if (playlist.length === 0) return;
        const nextIndex = (currentIndex + 1) % playlist.length;
        const next = playlist[nextIndex];
        setCurrentIndex(nextIndex);
        setCurrentTrack(next);
        setIsPlaying(true);
    };

    const prevTrack = () => {
        if (playlist.length === 0) return;
        const prevIndex = (currentIndex - 1 + playlist.length) % playlist.length;
        const prev = playlist[prevIndex];
        setCurrentIndex(prevIndex);
        setCurrentTrack(prev);
        setIsPlaying(true);
    };

    return (
        <PlayerContext.Provider
            value={{
                currentTrack,
                isPlaying,
                playlist,
                playTrack,
                togglePlay,
                setIsPlaying,
                closePlayer,
                nextTrack,
                prevTrack,
            }}
        >
            {children}
        </PlayerContext.Provider>
    );
}

export function usePlayer() {
    const context = useContext(PlayerContext);
    if (!context) {
        throw new Error("usePlayer должен использоваться внутри PlayerProvider");
    }
    return context;
}