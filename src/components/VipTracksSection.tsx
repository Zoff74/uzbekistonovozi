"use client";

// БЛОК - "VIP размещение" src\components\VipTracksSection.tsx
import React, { useRef, useState } from "react";
import { Play, Pause, Zap, Lock, CreditCard } from "lucide-react";
import { tr } from "@/utils/translate";

interface Track {
    _id: string;
    title: string;
    singer: string;
    genre: string;
    duration: string;
    cover: string;
    audioUrl: string;
    plays: string;
    price?: number; // Цена трека (если есть)
    isPurchased?: boolean; // Куплен ли пользователем
}

interface RecentReleasesProps {
    tracks: Track[];
    loading: boolean;
    currentTrackId: string | null;
    isPlaying: boolean;
    togglePlay: (id: string) => void;
}

export default function VipTracksSection({
    tracks,
    loading,
    currentTrackId,
    isPlaying,
    togglePlay,
}: RecentReleasesProps) {
    const sliderRef = useRef<HTMLDivElement | null>(null);

    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [pendingTrack, setPendingTrack] = useState<Track | null>(null);

    const scrollSlider = (direction: 'left' | 'right') => {
        if (sliderRef.current) {
            const scrollAmount = sliderRef.current.clientWidth * 0.8;
            sliderRef.current.scrollBy({ 
                left: direction === 'left' ? -scrollAmount : scrollAmount, 
                behavior: 'smooth' 
            });
        }
    };

    const handleDownloadClick = (e: React.MouseEvent, track: Track) => {
        e.stopPropagation();

        const userHasPaid = track.isPurchased || false; // Заглушка проверки оплаты (false = не куплено)

        if (!userHasPaid) {
            setPendingTrack(track);
            setShowPaymentModal(true);
            return;
        }

        // Если оплачено — скачиваем файл
        const a = document.createElement("a");
        a.href = track.audioUrl;
        a.download = `${track.singer} - ${track.title}.mp3`;
        a.target = "_blank";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    return (
        <section className="space-y-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
                <div className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                    <h2 className="text-base sm:text-lg font-black tracking-tight flex items-center gap-2 text-white">
                        {tr("VIP ТРЕКЛАР", "VIP TREKLAR", "VIP ТРЕКИ", "VIP TRACKS")}
                    </h2>
                </div>
                
                <div className="flex items-center gap-4">
                    <button 
                        onClick={() => scrollSlider('left')}
                        className="text-xs text-emerald-400 font-bold hover:underline transition flex items-center gap-1 cursor-pointer bg-transparent border-none p-0"
                    >
                        ← {tr("Орқага", "Orqqa", "Назад", "Back")}
                    </button>

                    <button 
                        onClick={() => scrollSlider('right')}
                        className="text-xs text-emerald-400 font-bold hover:underline transition flex items-center gap-1 cursor-pointer bg-transparent border-none p-0"
                    >
                        {tr("Давоми", "Davomi", "Далее", "Load More")} →
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center items-center py-20">
                    <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                </div>
            ) : tracks.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-sm border border-white/5 rounded-3xl bg-slate-950/40">
                    {tr("Ҳозирча Сизда треклар мавжуд эмас!", "Hozircha Sizda treklar mavjud emas!", "У Вас пока нет треков!", "No tracks available yet!")}
                </div>
            ) : (
                <div 
                    ref={sliderRef}
                    className="flex gap-3 overflow-x-auto scrollbar-none pb-2 pt-1 scroll-smooth snap-x snap-mandatory"
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                    {tracks.map((track) => {
                        const isCurrentThis = currentTrackId === track._id && isPlaying;
                        return (
                            <div 
                                key={track._id}
                                className="group relative bg-gradient-to-b from-slate-900/50 to-slate-950/85 hover:from-slate-900 hover:to-slate-900 border border-white/5 hover:border-emerald-500/50 rounded-2xl p-3 transition-all duration-300 flex flex-col justify-between shadow-lg hover:shadow-[0_0_20px_rgba(16,185,129,0.15)] hover:-translate-y-1 flex-shrink-0 w-[160px] sm:w-[180px] snap-start"
                            >
                                <div>
                                    <div 
                                        className="relative aspect-square rounded-xl overflow-hidden bg-slate-900 mb-2.5 shadow-md"
                                        onContextMenu={(e) => e.preventDefault()}
                                    >
                                        <img 
                                            src={track.cover} 
                                            alt={track.title} 
                                            className="object-cover w-full h-full group-hover:scale-105 transition duration-500 ease-out pointer-events-none"
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60" />
                                        
                                        {/* Метка VIP / Замок */}
                                        <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-md border border-white/15 text-[9px] font-bold text-emerald-400 flex items-center gap-0.5">
                                            <Lock className="w-2.5 h-2.5" /> VIP
                                        </div>

                                        <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-md border border-white/15 text-[9px] font-bold text-emerald-400 flex items-center gap-0.5">
                                            <Zap className="w-2 h-2" /> {track.plays}
                                        </div>

                                        <button 
                                            onClick={() => togglePlay(track._id)}
                                            className={`absolute bottom-2.5 right-2.5 w-9 h-9 rounded-xl bg-emerald-500 text-slate-950 flex items-center justify-center shadow-xl transform transition-all duration-300 hover:scale-110 active:scale-95 ${
                                                currentTrackId === track._id ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0'
                                            }`}
                                        >
                                            {isCurrentThis ? (
                                                <Pause className="w-4 h-4 fill-current" />
                                            ) : (
                                                <Play className="w-4 h-4 fill-current ml-0.5" />
                                            )}
                                        </button>
                                    </div>

                                    <div className="flex items-center justify-between gap-1 mb-1.5">
                                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-white/5 text-emerald-400 border border-white/5 truncate">
                                            {track.genre}
                                        </span>
                                        <span className="text-[10px] text-slate-500 flex-shrink-0">{track.duration}</span>
                                    </div>

                                    <h3 className="font-bold text-xs text-white group-hover:text-emerald-400 transition truncate">{track.title}</h3>
                                    <p className="text-[10px] text-slate-400 truncate mt-0.5">{track.singer}</p>
                                </div>
                                
                                <div className="mt-3 pt-2 border-t border-white/5 flex items-center justify-between">
                                    <span 
                                        onClick={() => togglePlay(track._id)}
                                        className="text-[10px] text-emerald-400 font-semibold cursor-pointer hover:underline flex items-center gap-1"
                                    >
                                        {isCurrentThis ? (tr("Пауза", "Pauza", "Пауза", "Pause")) : (tr("Тинглаш", "Tinglash", "Слушать", "Listen"))}
                                    </span>
                                    <button
                                        onClick={(e) => handleDownloadClick(e, track)}
                                        className="text-[10px] text-amber-400 font-semibold cursor-pointer hover:underline flex flex-col items-end gap-0.5 bg-transparent border-none p-0 text-right leading-tight"
                                        title={tr("Пуллик юклаб олиш", "Pullik yuklab olish", "Платная загрузка", "Paid download")}
                                    >
                                        <span className="flex items-center gap-0.5"><Lock className="w-2.5 h-2.5" /> {tr("Юклаб олиш", "Yuklab olish", "Скачать", "Download")}</span>
                                        <span className="text-[9px] opacity-80">({tr("Тўлов орқали", "To'lov orqali", "Через оплату", "Via payment")})</span>
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* МОДАЛЬНОЕ ОКНО ОПЛАТЫ ДЛЯ ТРЕКА */}
            {showPaymentModal && pendingTrack && (
                <div className="fixed inset-0 bg-black/90 backdrop-blur-lg z-50 flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-slate-900 border border-amber-500/30 rounded-3xl max-w-md w-full p-6 shadow-2xl relative space-y-6 text-center">
                        <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto shadow-[0_0_20px_rgba(16,185,129,0.2)]">
                            <CreditCard className="w-8 h-8" />
                        </div>

                        <div className="space-y-2">
                            <h3 className="text-lg font-bold text-white">{tr("Пуллик трек", "Pullik trek", "Платный трек", "Paid track")}</h3>
                            <p className="text-xs text-slate-400">
                                <span className="text-white font-semibold">{pendingTrack.singer} — {pendingTrack.title}</span> {tr("Бу трекни эшитиш ёки юклаб олиш учун тўлов талаб қилинади", "Bu trekni eshitish yoki yuklab olish uchun to'lov talab qilinadi", "Для прослушивания или скачивания этого трека требуется оплата", "Payment is required to listen or download this track")}
                            </p>
                        </div>

                        <div className="bg-slate-950/60 p-4 rounded-2xl border border-white/5 flex items-center justify-between">
                            <span className="text-xs text-slate-400">{tr("Нархи:", "Narxi:", "Цена:", "Price:")}</span>
                            <span className="text-sm font-black text-emerald-400">{pendingTrack.price || 5000} {tr("сўм", "so'm", "сум", "sum")}</span>
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowPaymentModal(false)}
                                className="w-1/2 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 font-bold text-xs transition cursor-pointer"
                            >
                                {tr("Бекор қилиш", "Bekor qilish", "Отмена", "Cancel")}
                            </button>
                            <button
                                onClick={() => {
                                    alert(tr("Тўлов тизимига улаш жараёни...", "To'lov tizimiga ulash jarayoni...", "Процесс подключения к платежной системе...", "Payment system connection process..."));
                                    setShowPaymentModal(false);
                                }}
                                className="w-1/2 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition shadow-lg cursor-pointer"
                            >
                                {tr("Тўлов қилиш", "To'lov qilish", "Оплатить", "Pay")}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}