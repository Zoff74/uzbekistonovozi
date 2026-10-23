"use client";

// БЛОК - "VideoCard" src/components/VideoCard.tsx
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Edit, Trash2, Play, Pause, Loader2, AlertCircle } from "lucide-react";
import { tr } from "@/utils/translate";
import { useSession } from "next-auth/react";

interface VideoCardProps {
    video: {
        _id: string;
        title: string;
        singer: string;
        cover?: string;
        genre?: string;
        views?: number;        
        downloadsCount?: number; 
        status: string;
        expiresAt: string;
        createdAt: string;
        isPaidActive?: boolean;
        authorId?: string;
        author?: string;
        userId?: string;
        videoUrl?: string;
        fileUrl?: string;
        fileId?: string;
        videoFileId?: string;
    };
    onDelete?: (id: string) => void;
    isOwner?: boolean;
}

const FAKE_SEQUENCE = [1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1];
const INTERVAL_MS = 15 * 60 * 1000; // 15 минут

export default function VideoCard({ video, onDelete }: VideoCardProps) {
    const router = useRouter();
    const { data: session } = useSession();

    const [isDeleting, setIsDeleting] = useState(false);
    const [isRemoved, setIsRemoved] = useState(false);
    
    // Состояния для реального встроенного плеера
    const [isPlayingVideo, setIsPlayingVideo] = useState(false);
    const [isLoadingVideo, setIsLoadingVideo] = useState(false);
    const [videoError, setVideoError] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);

    const videoId = video._id.toString();

    // 1. Надежное извлечение fileId из любого доступного поля
    const rawFileId = video.videoFileId || video.fileId;
    let computedFileId = rawFileId;

    if (!computedFileId) {
        const targetUrl = video.videoUrl || video.fileUrl || "";
        if (targetUrl.includes("/api/videos/stream/")) {
            computedFileId = targetUrl.split("/api/videos/stream/")[1]?.split("?")[0];
        }
    }

    // 2. Итоговый защищенный URL для стриминга через локальный эндпоинт
    const videoSrc = computedFileId 
        ? `/api/videos/stream/${computedFileId}` 
        : (video.videoUrl || video.fileUrl || "");

    // Проверка прав: владелец или админ
    const currentUserId = (session?.user as any)?.id;
    const currentUserRole = (session?.user as any)?.role;
    const isAdmin = currentUserRole === 'admin' || (session?.user as any)?.isAdmin === true;
    
    const videoAuthor = video.authorId || video.author || video.userId;
    const isOwner = currentUserId && videoAuthor && videoAuthor.toString() === currentUserId.toString();
    const canManage = isOwner || isAdmin;

    // Логика фейкового прироста просмотров
    const [fakeOffset, setFakeOffset] = useState(0);
    const [stepIndex, setStepIndex] = useState(0);

    useEffect(() => {
        if (!videoId) return;

        const stepKey = `fake_video_step_${videoId}`;
        const offsetKey = `fake_video_offset_${videoId}`;

        const savedStep = localStorage.getItem(stepKey);
        const savedOffset = localStorage.getItem(offsetKey);
        if (savedStep) setStepIndex(Number(savedStep));
        if (savedOffset) setFakeOffset(Number(savedOffset));

        const timer = setInterval(() => {
            const nextStep = (stepIndex + 1) % FAKE_SEQUENCE.length;
            const addValue = FAKE_SEQUENCE[nextStep];

            setFakeOffset((prev) => {
                const updated = prev + addValue;
                localStorage.setItem(offsetKey, String(updated));
                return updated;
            });

            setStepIndex(nextStep);
            localStorage.setItem(stepKey, String(nextStep));
        }, INTERVAL_MS);

        return () => clearInterval(timer);
    }, [stepIndex, videoId]);

    if (isRemoved) {
        return null;
    }

    const realViews = video.views || 0;
    const displayedViews = realViews + fakeOffset;

    const createdAtDate = new Date(video.createdAt || video.expiresAt);
    const expiresDate = new Date(video.expiresAt);
    const now = new Date();

    const hoursSinceCreation = (now.getTime() - createdAtDate.getTime()) / (1000 * 60 * 60);
    const isWithinFirst24Hours = hoursSinceCreation <= 24 && !video.isPaidActive;

    const diffTime = expiresDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    const handlePlayVideo = () => {
        if (!videoSrc) {
            alert(tr("Видео файл топилмади", "Video fayl topilmadi", "Видео файл не найден", "Video file not found"));
            return;
        }

        if (isPlayingVideo) {
            setIsPlayingVideo(false);
            if (videoRef.current) videoRef.current.pause();
        } else {
            setIsPlayingVideo(true);
            setIsLoadingVideo(true);
            setVideoError(false);
        }
    };

    const GradientBorder = () => (
        <div 
            className="absolute inset-0 rounded-xl z-0 shadow-[0_0_20px_rgba(57,255,20,0.3)] transition-all duration-500 group-hover:shadow-[inset_0_0_20px_rgba(0,0,0,1)] pointer-events-none"
            style={{
                padding: '2px',
                background: 'linear-gradient(to right, #000000, #FFDA09, #39FF14, #FFDA09, #000000)',
                WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                WebkitMaskComposite: 'xor',
                maskComposite: 'exclude',
            }}
        />
    );

    const handleDelete = async () => {
        if (!confirm(tr("Ростдан ҳам бу видеони ўчирмоқчимисиз?", "Rostdan ham bu videoni o'chirmoqchimisiz?", "Вы действительно хотите удалить это видео?", "Are you sure you want to delete this video?"))) return;

        try {
            setIsDeleting(true);
            const res = await fetch(`/api/videos/${videoId}`, { method: "DELETE" });
            if (res.ok) {
                setIsRemoved(true);
                if (onDelete) {
                    onDelete(videoId);
                }
                router.refresh();
            } else {
                const data = await res.json();
                alert(data.error || tr("Хатолик юз берди", "Xatolik yuz berdi", "Произошла ошибка", "An error occurred"));
                setIsDeleting(false);
            }
        } catch {
            alert(tr("Сервер билан алоқада хатолик", "Server bilan aloqada xatolik", "Ошибка связи с сервером", "Server connection error"));
            setIsDeleting(false);
        }
    };

    return (
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 sm:p-6 flex flex-col gap-5 transition hover:border-neutral-700">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
                
                {/* МЕДИАТЕКА / ПЛЕЕР ИЛИ ОБЛОЖКА */}
                <div className="relative w-full sm:w-48 aspect-video sm:aspect-square rounded-2xl object-cover border border-neutral-800 shrink-0 overflow-hidden bg-black flex items-center justify-center">
                    {!isPlayingVideo ? (
                        <div 
                            onClick={handlePlayVideo}
                            className="relative w-full h-full cursor-pointer group"
                        >
                            <img
                                src={video.cover || "/default-cover.webp"}
                                alt={video.title}
                                className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-amber-400">
                                <Play size={36} fill="currentColor" />
                            </div>
                        </div>
                    ) : (
                        <div className="relative w-full h-full flex items-center justify-center">
                            {isLoadingVideo && !videoError && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-10 gap-1.5">
                                    <Loader2 className="w-6 h-6 text-[#39FF14] animate-spin" />
                                    <span className="text-[#39FF14] text-[10px] font-semibold tracking-wider uppercase animate-pulse">
                                        {tr("Юкланмоқда...", "Yuklanmoqda...", "Загрузка...", "Loading...")}
                                    </span>
                                </div>
                            )}

                            {videoError && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-10 p-2 text-center">
                                    <AlertCircle className="w-6 h-6 text-red-500 mb-1" />
                                    <span className="text-red-400 text-[11px]">
                                        {tr("Хатолик / Файл катта", "Xatolik / Fayl katta", "Ошибка / Файл велик", "Error / File too big")}
                                    </span>
                                </div>
                            )}

                            <video
                                ref={videoRef}
                                controls
                                autoPlay
                                playsInline
                                preload="auto"
                                onLoadedData={() => setIsLoadingVideo(false)}
                                onCanPlay={() => setIsLoadingVideo(false)}
                                onWaiting={() => setIsLoadingVideo(true)}
                                onPlaying={() => setIsLoadingVideo(false)}
                                onError={() => {
                                    setIsLoadingVideo(false);
                                    setVideoError(true);
                                }}
                                className="w-full h-full object-contain"
                            >
                                <source src={videoSrc} type="video/mp4" />
                                {tr("Браузерингиз видеони қўллаб-қувватламайди", "Brauzeringiz videoni qo'llab-quvvatlamaydi", "Ваш браузер не поддерживает видео", "Your browser does not support video")}
                            </video>
                        </div>
                    )}
                </div>

                <div className="min-w-0 flex-1">
                    <h3 
                        onClick={handlePlayVideo}
                        className="font-bold text-lg sm:text-xl text-white break-words cursor-pointer hover:text-amber-400 transition"
                    >
                        {video.title}
                    </h3>
                    <p className="text-base text-neutral-200 mt-1 break-words font-medium">
                        {video.singer} • <span className="text-amber-400">{video.genre}</span>
                    </p>
                    
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-sm text-neutral-300">
                        <span>
                            {tr("Кўрилган", "Ko'rilgan", "Просмотров", "Views")}:{" "}
                            <strong className="text-white font-semibold">{displayedViews}</strong>
                            <span className="text-neutral-500 text-xs ml-1.5">({realViews})</span>
                        </span>
                        <span className="hidden sm:inline">•</span>
                        <span>
                            {tr("Юклаб олинган", "Yuklab olingan", "Скачиваний", "Downloads")}:{" "}
                            <strong className="text-white font-semibold">{video.downloadsCount || 0}</strong>
                        </span>
                    </div>
                </div>
            </div>

            {canManage && (
                <div className="flex flex-col gap-3 bg-neutral-950/70 p-4 sm:p-5 rounded-2xl border border-neutral-800/80 text-sm sm:text-base">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <span className={`inline-block px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-bold ${
                            video.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                        }`}>
                            {video.status === 'ACTIVE' ? tr("Фаол", "Faol", "Активен", "Active") : tr("Муддати тугаган", "Muddati tugagan", "Срок истек", "Expired")}
                        </span>
                        
                        <span className="text-neutral-200 font-semibold">
                            {isAdmin ? (
                                <span className="text-emerald-400">
                                    {tr("Чексиз фаол (Администратор)", "Cheksiz faol (Administrator)", "Активен бессрочно (Администратор)", "Active indefinitely (Administrator)")}
                                </span>
                            ) : diffDays > 0 ? (
                                `${tr("Серверда сақланиш вақти:", "Serverda saqlanish vaqti:", "Срок размещения на сайте:", "Time left on site:")} ${diffDays} ${tr("кун", "kun", "дней", "days")}.`
                            ) : (
                                tr("Муддат тугади", "Muddat tugadi", "Срок истек", "Term expired")
                            )}
                        </span>
                    </div>
                </div>
            )}

            {canManage && (
                <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-800/80">
                    <div className="relative h-[42px] group flex items-center justify-center cursor-pointer">
    <div className="absolute inset-0 bg-gradient-to-r from-black to-gray-600 rounded-lg z-0 shadow-[0_0_15px_rgba(57,255,20,0.15)] transition-all duration-500 group-hover:shadow-[inset_0_0_20px_rgba(0,0,0,1)]" />
    
    <button
        type="button"
        onClick={(e) => {
            if (!isAdmin && !isWithinFirst24Hours) {
                e.preventDefault();
                alert(tr(
                    "Видеофайлга ўзгартириш киритиш муддати (24 соат) тугаган!",
                    "Videofaylga o'zgartirish kiritish muddati (24 soat) tugagan!",
                    "Разрешенный срок для внесения изменений в видеофайл (24 часа) истек!",
                    "The time limit (24 hours) for changing the video file has expired!"
                ));
                return;
            }
            router.push(`/dashboard/videos/${videoId}/edit`);
        }}
        className="relative h-[34px] z-10 flex items-center justify-center gap-1.5 px-3 rounded-md border-[2px] border-transparent bg-clip-border text-[10px] font-bold uppercase tracking-wider transition-all duration-300 overflow-hidden group-hover:scale-95 group-active:scale-90 bg-black text-[#39FF14] group-hover:text-white whitespace-nowrap cursor-pointer"
        style={{ 
            borderImageSource: 'linear-gradient(to right, #000000, #FFDA09, #39FF14, #FFDA09, #000000)', 
            borderImageSlice: 1 
        }}
    >
        <Edit size={12} className="relative z-10 text-[#39FF14] group-hover:text-white transition-colors shrink-0" />
        <span className="relative z-10">
            {tr("Ўзгартириш", "O'zgartirish", "Изменить", "Edit")}
        </span>
    </button>
</div>
                    
                    <div className="relative rounded-xl inline-block group">
                        <button
                            onClick={handleDelete}
                            disabled={isDeleting}
                            className="relative z-10 p-3 rounded-xl bg-neutral-950 text-neutral-200 hover:text-red-400 transition text-sm font-semibold disabled:opacity-50 cursor-pointer flex items-center justify-center"
                            title={tr("Видеоларни ўчириш", "Videolarni o'chirish", "Удалить видео", "Delete video")}
                        >
                            <Trash2 size={18} />
                        </button>
                        <GradientBorder />
                    </div>
                </div>
            )}
        </div>
    );
}