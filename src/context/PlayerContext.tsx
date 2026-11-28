"use client";
// src/context/PlayerContext.tsx
import React, { createContext, useContext, useState, useCallback, useMemo } from "react";

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

function getTrackKey(track: Track | null | undefined): string {
    if (!track) return "";
    return String(track._id || track.id || track.videoFileId || track.videoUrl || track.audioUrl || "").trim();
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
    const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [playlist, setPlaylist] = useState<Track[]>([]);
    const [currentIndex, setCurrentIndex] = useState<number>(0);

    const playTrack = useCallback((track: Track, queue: Track[] = []) => {
        if (!track.audioUrl && !track.videoUrl && !track.videoFileId) {
            console.error("У трека нет ни audioUrl, ни videoUrl, ни videoFileId!", track);
            alert("Невозможно воспроизвести: медиафайл не найден");
            return;
        }
        const newPlaylist = queue.length > 0 ? queue : [track];
        const targetKey = getTrackKey(track);
        const index = newPlaylist.findIndex((t) => getTrackKey(t) === targetKey);

        setPlaylist(newPlaylist);
        setCurrentIndex(index !== -1 ? index : 0);

        setCurrentTrack((prevTrack) => {
            const sameTrack =
                prevTrack &&
                getTrackKey(prevTrack) === targetKey &&
                prevTrack.audioUrl === track.audioUrl &&
                prevTrack.videoUrl === track.videoUrl &&
                prevTrack.videoFileId === track.videoFileId;

            if (sameTrack) {
                setIsPlaying((prevPlaying) => !prevPlaying);
                return prevTrack;
            }
            setIsPlaying(true);
            return track;
        });
    }, []);

    const togglePlay = useCallback(() => {
        setIsPlaying((prev) => (currentTrack ? !prev : false));
    }, [currentTrack]);

    const closePlayer = useCallback(() => {
        setIsPlaying(false);
        setCurrentTrack(null);
        setPlaylist([]);
        setCurrentIndex(0);
    }, []);

    const nextTrack = useCallback(() => {
        setPlaylist((prevPlaylist) => {
            if (prevPlaylist.length === 0) return prevPlaylist;
            setCurrentIndex((prevIndex) => {
                const nextIdx = (prevIndex + 1) % prevPlaylist.length;
                setCurrentTrack(prevPlaylist[nextIdx]);
                setIsPlaying(true);
                return nextIdx;
            });
            return prevPlaylist;
        });
    }, []);

    const prevTrack = useCallback(() => {
        setPlaylist((prevPlaylist) => {
            if (prevPlaylist.length === 0) return prevPlaylist;
            setCurrentIndex((prevIndex) => {
                const prevIdx = (prevIndex - 1 + prevPlaylist.length) % prevPlaylist.length;
                setCurrentTrack(prevPlaylist[prevIdx]);
                setIsPlaying(true);
                return prevIdx;
            });
            return prevPlaylist;
        });
    }, []);

    const contextValue = useMemo(
        () => ({
            currentTrack,
            isPlaying,
            playlist,
            playTrack,
            togglePlay,
            setIsPlaying,
            closePlayer,
            nextTrack,
            prevTrack,
        }),
        [currentTrack, isPlaying, playlist, playTrack, togglePlay, closePlayer, nextTrack, prevTrack]
    );

    return (
        <PlayerContext.Provider value={contextValue}>
            {children}
        </PlayerContext.Provider>
    );
}

export function usePlayer() {
    const context = useContext(PlayerContext);
    if (!context) throw new Error("usePlayer должен использоваться внутри PlayerProvider");
    return context;
}