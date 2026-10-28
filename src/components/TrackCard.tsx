"use client";

// БЛОК - "TrackCard" src/components/TrackCard.tsx
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Edit, Trash2, Play, Pause } from "lucide-react";
import { tr } from "@/utils/translate";
import { useSession } from "next-auth/react";
import { usePlayer } from "@/context/PlayerContext";

interface TrackCardProps {
    track: {
        _id: string;
        title: string;
        singer: string;
        cover?: string;
        genre?: string;
        plays?: number;
        downloadsCount?: number;
        status: string;
        expiresAt: string;
        createdAt: string;
        isPaidActive?: boolean;
        isExpired?: boolean; // 👈 Флаг просрочки от бэкенда
        authorId?: string;
        author?: string;
        userId?: string;
        audioUrl?: string;
        fileUrl?: string;
    };
    onDelete?: (id: string) => void;
    isOwner?: boolean;
}

const FAKE_SEQUENCE = [1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1];
const INTERVAL_MS = 15 * 60 * 1000; // 15 минут

export default function TrackCard({ track, onDelete }: TrackCardProps) {
    const router = useRouter();
    const { data: session } = useSession();
    const { playTrack, currentTrack, isPlaying } = usePlayer();

    const [isDeleting, setIsDeleting] = useState(false);
    const [showTariffs, setShowTariffs] = useState(false);
    const [isRemoved, setIsRemoved] = useState(false);
    const trackId = track._id.toString();

    // Проверка прав: является ли текущий юзер владельцем или админом
    const currentUserId = (session?.user as any)?.id;
    const currentUserRole = (session?.user as any)?.role;
    const isAdmin = currentUserRole === 'admin' || (session?.user as any)?.isAdmin === true;
    
    const trackAuthor = track.authorId || track.author || track.userId;
    const isOwner = currentUserId && trackAuthor && trackAuthor.toString() === currentUserId.toString();
    const canManage = isOwner || isAdmin;

    // Проверяем, играет ли именно этот трек прямо сейчас
    const isThisTrackPlaying = currentTrack && (currentTrack.id === trackId || currentTrack._id === trackId) && isPlaying;

    // Логика фейкового прироста прослушиваний
    const [fakeOffset, setFakeOffset] = useState(0);
    const [stepIndex, setStepIndex] = useState(0);

    useEffect(() => {
        if (!trackId) return;

        const stepKey = `fake_view_step_${trackId}`;
        const offsetKey = `fake_view_offset_${trackId}`;

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
    }, [stepIndex, trackId]);

    if (isRemoved) {
        return null;
    }

    const realPlays = track.plays || 0;
    const displayedPlays = realPlays + fakeOffset;

    const createdAtDate = new Date(track.createdAt || track.expiresAt);
    const expiresDate = new Date(track.expiresAt);
    const now = new Date();

    const hoursSinceCreation = (now.getTime() - createdAtDate.getTime()) / (1000 * 60 * 60);
    const isWithinFirst24Hours = hoursSinceCreation <= 24 && !track.isPaidActive;

    const diffTime = expiresDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    const handlePlayClick = () => {
        const audioSrc = track.audioUrl || track.fileUrl || "";
        if (!audioSrc) {
            alert(tr("Аудио файл топилмади", "Audio fayl topilmadi", "Аудио файл не найден", "Audio file not found"));
            return;
        }

        const streamUrl = `/api/tracks/stream/${trackId}`;

        playTrack({
            id: trackId,
            title: track.title,
            singer: track.singer,
            audioUrl: streamUrl,
            cover: track.cover,
        });
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
        if (!confirm(tr("Ростдан ҳам бу трекни ўчирмоқчимисиз?", "Rostdan ham bu trekni o'chirmoqchimisiz?", "Вы действительно хотите удалить этот трек?", "Are you sure you want to delete this track?"))) return;

        try {
            setIsDeleting(true);
            const res = await fetch(`/api/tracks/${trackId}`, { method: "DELETE" });
            
            setIsRemoved(true);
            if (onDelete) {
                onDelete(trackId);
            }

            if (res.ok) {
                router.refresh();
            } else {
                const data = await res.json();
                console.warn("Server delete warning:", data.error);
            }
        } catch (err) {
            console.error("Delete connection error:", err);
            setIsRemoved(true);
        }
    };

    return (
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 sm:p-6 flex flex-col gap-5 transition hover:border-neutral-700 relative">
            
            {/* Уведомление о просрочке (если не оплачено) */}
            {track.isExpired && !canManage && (
                <div className="absolute top-3 right-3 bg-red-500/10 border border-red-500/20 text-red-400 text-[11px] px-2.5 py-1 rounded-lg font-medium">
                    {tr("Тўлов кутилмоқда (Автор маълумоти яширилган)", "To'lov kutilmoqda", "Ожидает оплаты", "Awaiting payment")}
                </div>
            )}

            <div className="flex items-start sm:items-center gap-5">
                <div 
                    onClick={handlePlayClick}
                    className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-2xl object-cover border border-neutral-800 shrink-0 cursor-pointer group overflow-hidden"
                >
                    <img
                        src={track.cover || "/default-cover.webp"}
                        alt={track.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-emerald-400">
                        {isThisTrackPlaying ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" />}
                    </div>
                </div>

                <div className="min-w-0 flex-1">
                    {/* НАЗВАНИЕ ТРЕКА ВСЕГДА ЧЕТКОЕ И КЛИКАБЕЛЬНОЕ */}
                    <h3 
                        onClick={handlePlayClick}
                        className="font-bold text-lg sm:text-xl text-white break-words cursor-pointer hover:text-emerald-400 transition"
                    >
                        {track.title}
                    </h3>

                    {/* ВСЁ ОСТАЛЬНОЕ (Исполнитель, Жанр, Статистика) БЛЮРИТСЯ ПРИ ИСТЕЧЕНИИ СРОКА */}
                    <div className={track.isExpired && !canManage ? "filter blur-[6px] select-none pointer-events-none opacity-60 mt-1" : "mt-1"}>
                        <p className="text-base text-neutral-200 break-words font-medium">
                            {track.singer} • <span className="text-amber-400">{track.genre}</span>
                        </p>
                        
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-sm text-neutral-300">
                            <span>
                                {tr("Эшитилган", "Eshitilgan", "Прослушиваний", "Plays")}:{" "}
                                <strong className="text-white font-semibold">{displayedPlays}</strong>
                                <span className="text-neutral-500 text-xs ml-1.5">({realPlays})</span>
                            </span>
                            <span className="hidden sm:inline">•</span>
                            <span>
                                {tr("Юклаб олинган", "Yuklab olingan", "Скачиваний", "Downloads")}:{" "}
                                <strong className="text-white font-semibold">{track.downloadsCount || 0}</strong>
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {canManage && (
                <div className="flex flex-col gap-3 bg-neutral-950/70 p-4 sm:p-5 rounded-2xl border border-neutral-800/80 text-sm sm:text-base">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <span className={`inline-block px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-bold ${
                            track.status === 'ACTIVE' && !track.isExpired ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        }`}>
                            {track.isExpired ? tr("Мөддати тугаган (Тинглаш мумкин)", "Muddati tugagan", "Срок истек (Доступно прослушивание)", "Expired (Listen only)") : (track.status === 'ACTIVE' ? tr("Фаол", "Faol", "Активен", "Active") : tr("Музлатилган", "Muzlatilgan", "Заморожен", "Frozen"))}
                        </span>
                        
                        <span className="text-neutral-200 font-semibold">
                            {isAdmin ? (
                                <span className="text-emerald-400">
                                    {tr("Чексиз фаол (Администратор)", "Cheksiz faol (Administrator)", "Активен бессрочно (Администратор)", "Active indefinitely (Administrator)")}
                                </span>
                            ) : diffDays > 0 ? (
                                `${tr("Серверда сақланиш вақти:", "Serverda saqlanish vaqti:", "Срок размещения на сайте:", "Time left on site:")} ${diffDays} ${tr("кун", "kun", "дней", "days")}.`
                            ) : (
                                <span className="text-amber-400">{tr("Тўлов кутилмоқда (Авто-блюр ёқилган)", "To'lov kutilmoqda", "Ожидает оплаты", "Awaiting payment")}</span>
                            )}
                        </span>
                    </div>

                    {!isAdmin && (!track.isPaidActive || track.isExpired) && (
                        <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-xl space-y-3 text-sm sm:text-base">
                            <div className="flex flex-wrap items-center justify-between gap-2 font-bold text-amber-400">
                                <span>⚠️ {tr("Диққат! Жойлаштириш муддати тугади:", "Diqqat! Joylashtirish muddati tugadi:", "Внимание! Срок размещения истек:", "Attention! Placement expired:")}</span>
                                <button 
                                    onClick={() => setShowTariffs(!showTariffs)}
                                    className="underline hover:text-amber-300 transition text-sm font-semibold cursor-pointer bg-transparent border-none p-0"
                                >
                                    {showTariffs ? tr("Тарифларни яшириш", "Tariflarni yashirish", "Скрыть тарифы", "Hide tariffs") : tr("Тўлов қилиш ва очиш", "To'lov qilish va ochish", "Оплатить и разблокировать", "Pay & Unlock")}
                                </button>
                            </div>

                            <p className="text-neutral-200 leading-relaxed font-medium">
                                {tr(
                                    "Трек ҳозир ҳам сайтда трансляция қилинмоқда, лекин тўлов қилинмагани сабабли муаллиф маълумотлари блюр (хиралаштирилган) қилинган. Тўловни амалга ошириб маълумотларни тўлиқ очинг!",
                                    "Trek hozir ham saytda translyatsiya qilinmoqda, lekin to'lov qilinmagani sababli muallif ma'lumotlari blur qilingan.",
                                    "Трек продолжает транслироваться, но данные автора размыты из-за неоплаты. Оплатите размещение, чтобы снять блюр!",
                                    "Track is still broadcast, but author info is blurred due to lack of payment."
                                )}
                            </p>

                            {showTariffs && (
                                <div className="pt-3 border-t border-amber-500/20 space-y-2 text-neutral-100">
                                    <p className="font-bold text-amber-300">💡 {tr("ПЛАТФОРМА ТАРИФЛАРИ:", "PLATFORMA TARIFLARI:", "ТАРИФЫ ПЛАТФОРМЫ:", "PLATFORM TARIFFS:")}</p>
                                    <ul className="list-disc list-inside space-y-1.5 text-neutral-200 pl-1 font-medium">
                                        <li><strong className="text-white">{tr("Базавий тўлов:", "Bazaviy to'lov:", "Базовый платеж:", "Base fee:")}</strong> 10 000 сўм</li>
                                        <li><strong className="text-white">{tr("Кунлик тўлов:", "Kunlik to'lov:", "Ежедневно:", "Daily:")}</strong> 1 000 сўм / кун</li>
                                        <li><strong className="text-white">{tr("Оптом 1 ойлик:", "Optom 1 oylik:", "Месячный опт:", "Monthly:")}</strong> <span className="text-emerald-400 font-bold">30 000 сўм</span></li>
                                    </ul>
                                </div>
                            )}
                        </div>
                    )}
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
                                        "Қўшиқ файлига ўзгартириш киритиш муддати (24 соат) тугаган!",
                                        "Qo'shiq fayliga o'zgartirish kiritish muddati (24 soat) tugagan!",
                                        "Разрешенный срок для внесения изменений в аудиофайл (24 часа) истек!",
                                        "The time limit (24 hours) for changing the audio file has expired!"
                                    ));
                                    return;
                                }
                                router.push(`/dashboard/tracks/${trackId}/edit`);
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
                            className="relative z-10 p-3 rounded-xl bg-neutral-950 text-neutral-200 hover:text-red-400 transition text-sm sm:text-base font-semibold disabled:opacity-50 cursor-pointer flex items-center justify-center"
                            title={tr("Трекни ўчириш", "Trekni o'chirish", "Удалить трек", "Delete track")}
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