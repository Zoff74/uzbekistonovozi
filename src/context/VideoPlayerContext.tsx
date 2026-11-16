"use client";
//src/context/VideoPlayerContext.tsx
import React, { createContext, useContext, useState } from "react";

interface VideoItem {
    id: string;
    title: string;
    singer: string;
    genre?: string;
}

interface VideoPlayerContextType {
    currentVideo: VideoItem | null;
    isOpen: boolean;
    openVideo: (video: VideoItem) => void;
    closeVideo: () => void;
}

const VideoPlayerContext = createContext<VideoPlayerContextType | undefined>(undefined);

export function VideoPlayerProvider({ children }: { children: React.ReactNode }) {
    const [currentVideo, setCurrentVideo] = useState<VideoItem | null>(null);
    const [isOpen, setIsOpen] = useState(false);

    const openVideo = (video: VideoItem) => {
        setCurrentVideo(video);
        setIsOpen(true);
    };

    const closeVideo = () => {
        setIsOpen(false);
        setCurrentVideo(null);
    };

    return (
        <VideoPlayerContext.Provider value={{ currentVideo, isOpen, openVideo, closeVideo }}>
            {children}
        </VideoPlayerContext.Provider>
    );
}

export function useVideoPlayer() {
    const context = useContext(VideoPlayerContext);
    if (!context) {
        throw new Error("useVideoPlayer must be used within a VideoPlayerProvider");
    }
    return context;
}