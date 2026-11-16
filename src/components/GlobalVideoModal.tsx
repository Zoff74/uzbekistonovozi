"use client";
import { useVideoPlayer } from "@/context/VideoPlayerContext";
import { X } from "lucide-react";

export default function GlobalVideoModal() {
    const { currentVideo, isOpen, closeVideo } = useVideoPlayer();

    if (!isOpen || !currentVideo) return null;

    const videoId = (currentVideo as any).id || (currentVideo as any)._id || "";
    const streamUrl = videoId ? `/api/videos/stream/${videoId}` : "";

    return (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 sm:p-6">
            <div className="relative w-full max-w-4xl bg-neutral-900 border border-neutral-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col">
                
                {/* Шапка модалки */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-950">
                    <div>
                        <h3 className="text-white font-bold text-lg sm:text-xl truncate">{currentVideo.title}</h3>
                        <p className="text-neutral-400 text-sm">{currentVideo.singer} {currentVideo.genre ? `• ${currentVideo.genre}` : ""}</p>
                    </div>
                    <button
                        onClick={closeVideo}
                        className="p-2.5 rounded-full bg-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-700 transition cursor-pointer"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Плеер со стримом (без фризов) */}
                <div className="relative w-full aspect-video bg-black flex items-center justify-center">
                    {videoId ? (
                        <video
                            src={streamUrl}
                            controls
                            preload="metadata"
                            playsInline
                            className="w-full h-full object-contain bg-black"
                        />
                    ) : (
                        <div className="text-red-400 text-sm font-semibold">
                            Ошибка: Не найден ID видео для запуска стрима
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}