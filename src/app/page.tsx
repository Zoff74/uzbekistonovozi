"use client";
//src\app\page.tsx
import React, { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

import Header from "@/components/Header";
import RecentReleases from "@/components/VipTracksSection";
import VipClips from "@/components/VipClipsSection";
import GenreCategories from "@/components/GenreCategories";
import WelcomeHero from "@/components/WelcomeHero"; 
import { usePlayer } from "@/context/PlayerContext";

interface Track {
    _id: string;
    title: string;
    singer: string;
    genre: string;
    duration: string;
    cover: string;
    audioUrl: string;
    plays: string;
}

export default function Home() {
    const { data: session } = useSession();
    const router = useRouter();
    
    const { playTrack, currentTrack, isPlaying, togglePlay } = usePlayer();
    
    const [isMounted, setIsMounted] = useState(false);
    useEffect(() => {
        setIsMounted(true);
    }, []);

    const [tracks, setTracks] = useState<Track[]>([]);
    const [clips, setClips] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingClips, setLoadingClips] = useState(true);

    useEffect(() => {
        if (!session?.user) {
            setLoading(false);
            return;
        }

        fetch("/api/tracks")
            .then((res) => res.json())
            .then((data) => {
                if (Array.isArray(data)) {
                    setTracks(data);
                } else if (data && Array.isArray(data.tracks)) {
                    setTracks(data.tracks);
                } else if (data && data.success && Array.isArray(data.data)) {
                    setTracks(data.data);
                }
            })
            .catch((err) => console.error("Ошибка загрузки треков:", err))
            .finally(() => setLoading(false));
    }, [session]);

    useEffect(() => {
        if (!session?.user) {
            setLoadingClips(false);
            return;
        }

        fetch("/api/videos")
            .then((res) => res.json())
            .then((data) => {
                if (Array.isArray(data)) {
                    setClips(data);
                } else if (data && Array.isArray(data.videos)) {
                    setClips(data.videos);
                } else if (data && data.success && Array.isArray(data.data)) {
                    setClips(data.data);
                }
            })
            .catch((err) => console.error("Ошибка загрузки клипов:", err))
            .finally(() => setLoadingClips(false));
    }, [session]);

    const handleTogglePlay = (track: Track) => {
        const formattedTrack = {
            id: track._id,
            title: track.title,
            singer: track.singer,
            cover: track.cover,
            audioUrl: track.audioUrl,
            videoUrl: "", 
        };

        if (currentTrack?.id === track._id) {
            togglePlay();
        } else {
            playTrack(formattedTrack);
        }
    };

    if (!isMounted) {
        return <div className="bg-[#030712] min-h-screen" />;
    }

    if (!session?.user) {
        return <WelcomeHero />;
    }

    return (
        <div className="bg-[#030712] text-white flex flex-col font-sans selection:bg-emerald-500 selection:text-black overflow-x-hidden relative min-h-screen">
            
            <div className="absolute top-[-10%] left-[-10%] w-[350px] lg:w-[400px] h-[350px] lg:h-[400px] bg-emerald-600/15 rounded-full blur-[120px] pointer-events-none" />
            <div className="absolute top-[30%] right-[-10%] w-[450px] lg:w-[500px] h-[450px] lg:h-[500px] bg-cyan-600/10 rounded-full blur-[140px] pointer-events-none" />

            {/* Подключенный компонент шапки */}
            <Header />

            <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10 w-full space-y-12 sm:space-y-16 relative z-10 mb-20">
                <RecentReleases 
                    tracks={tracks}
                    loading={loading}
                    currentTrackId={currentTrack?._id || currentTrack?.id || null}
                    isPlaying={isPlaying}
                    togglePlay={(id) => {
                        const targetTrack = tracks.find(t => t._id === id);
                        if (targetTrack) handleTogglePlay(targetTrack);
                    }}
                />

                <VipClips 
                    clips={clips}
                    loading={loadingClips}
                    onSelectClip={(clip) => {
                        console.log("Выбран клип:", clip?.title);
                    }}
                />

                <GenreCategories />
            </main>

            <footer className="border-t border-white/5 bg-black py-8 text-center text-xs text-slate-600 tracking-wider">
                <p>© 2026 O'zbekiston ovozi. Barcha huquqlar himoyalangan.</p>
            </footer>
        </div>
    );
}