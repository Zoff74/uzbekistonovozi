"use client";

// БЛОК - "VIP Видео Клиплар" src\components\VipClipsSection.tsx
import React, { useState } from "react";
import { Video, Play, Lock, CreditCard } from "lucide-react";
import { tr } from "@/utils/translate";

interface Clip {
    _id: string;
    title: string;
    singer: string;
    videoUrl: string;
    cover?: string;
    views?: string;
    price?: number;
    isPurchased?: boolean;
}

interface VipClipsProps {
    clips: Clip[];
    loading: boolean;
    onSelectClip?: (clip: Clip) => void;
}

export default function VipClips({ clips, loading, onSelectClip }: VipClipsProps) {
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [pendingClip, setPendingClip] = useState<Clip | null>(null);

    const handleCardClick = (clip: Clip) => {
        if (onSelectClip) {
            onSelectClip(clip);
        }
    };

    const handleDownloadClick = (e: React.MouseEvent, clip: Clip) => {
        e.stopPropagation();

        const userHasPaid = clip.isPurchased || false;

        if (!userHasPaid) {
            setPendingClip(clip);
            setShowPaymentModal(true);
            return;
        }

        // Если оплачено — скачиваем оригинал через защищённый роут
        const a = document.createElement("a");
        a.href = `/api/download/video/${clip._id}`;
        a.download = `${clip.title}.mp4`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    return (
        <section className="space-y-6">
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.15)]">
                        <Video className="w-6 h-6" />
                    </div>
                    <div>
                        <h2 className="text-base sm:text-lg font-black tracking-tight flex items-center gap-2 text-white">
                            {tr("VIP КЛИПЛАР ВА ПРЕМИУМ КОНТЕНТ", "VIP KLIPLAR VA PREMIUM KONTENT", "VIP КЛИПЫ И ПРЕМИУМ КОНТЕНТ", "VIP CLIPS & PREMIUM CONTENT")}
                        </h2>
                        <p className="text-xs sm:text-sm text-slate-400">
                            {tr("Эксклюзив видеоматериаллар ва махсус премьералар", "Eksklyuziv videofayllar va maxsus premierelar", "Эксклюзивные видеоматериалы и специальные премьеры", "Exclusive video materials and special premieres")}
                        </p>
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="bg-slate-900/50 border border-white/5 rounded-2xl h-48 animate-pulse" />
                    ))}
                </div>
            ) : clips.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {clips.map((clip) => (
                        <div
                            key={clip._id}
                            onClick={() => handleCardClick(clip)}
                            className="group bg-slate-900/60 border border-white/5 hover:border-cyan-500/40 rounded-2xl p-3 transition duration-300 cursor-pointer hover:shadow-[0_4px_20px_rgba(6,182,212,0.15)] flex flex-col justify-between"
                        >
                            <div>
                                <div className="aspect-video bg-slate-800 rounded-xl overflow-hidden relative mb-3">
                                    {clip.cover ? (
                                        <img src={clip.cover} alt={clip.title} className="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-slate-600">
                                            <Video className="w-8 h-8" />
                                        </div>
                                    )}
                                    
                                    <div className="absolute top-2 left-2 px-2 py-0.5 rounded-lg bg-black/60 backdrop-blur-md border border-white/15 text-[10px] font-bold text-cyan-400 flex items-center gap-1">
                                        <Lock className="w-3 h-3" /> VIP
                                    </div>

                                    <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition flex items-center justify-center">
                                        <div className="w-10 h-10 rounded-full bg-cyan-500 text-slate-950 flex items-center justify-center opacity-0 group-hover:opacity-100 transform scale-75 group-hover:scale-100 transition shadow-lg">
                                            <Play className="w-5 h-5 fill-current ml-0.5" />
                                        </div>
                                    </div>
                                </div>

                                <h3 className="font-bold text-sm text-white truncate group-hover:text-cyan-400 transition">{clip.title}</h3>
                                <p className="text-xs text-slate-400 truncate mt-0.5">{clip.singer}</p>
                            </div>

                            <div className="mt-3 pt-2 border-t border-white/5 flex items-center justify-between">
                                <span className="text-[10px] text-cyan-400 font-semibold flex items-center gap-1 hover:underline">
                                    {tr("Томоша қилиш", "Tomosha qilish", "Смотреть", "Watch")}
                                </span>
                                <button
                                    onClick={(e) => handleDownloadClick(e, clip)}
                                    className="text-[10px] text-amber-400 font-semibold hover:underline flex items-center gap-1 bg-transparent border-none cursor-pointer p-0"
                                    title={tr("Пуллик юклаб олиш", "Pullik yuklab olish", "Платная загрузка", "Paid download")}
                                >
                                    <Lock className="w-3 h-3" /> {tr("Тўлов орқали юклаб олиш", "To'lov orqali yuklab olish", "Скачать через оплату", "Download via payment")}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="bg-slate-900/30 border border-white/5 rounded-2xl p-8 text-center text-slate-400">
                    <p className="text-sm">{tr("Ҳозирча Сизда VIP клиплар мавжуд эмас.", "Hozircha Sizda VIP kliplar mavjud emas.", "У Вас пока нет VIP клипов.", "No VIP clips available yet.")}</p>
                </div>
            )}

            {/* МОДАЛЬНОЕ ОКНО ОПЛАТЫ */}
            {showPaymentModal && pendingClip && (
                <div className="fixed inset-0 bg-black/90 backdrop-blur-lg z-50 flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-slate-900 border border-amber-500/30 rounded-3xl max-w-md w-full p-6 shadow-2xl relative space-y-6 text-center">
                        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto shadow-[0_0_20px_rgba(245,158,11,0.2)]">
                            <CreditCard className="w-8 h-8" />
                        </div>

                        <div className="space-y-2">
                            <h3 className="text-lg font-bold text-white">
                                {tr("Пуллик контентни сотиб олиш", "Pullik kontentni sotib olish", "Покупка платного контента", "Purchase paid content")}
                            </h3>
                            <p className="text-xs text-slate-400">
                                <span className="text-white font-semibold">{pendingClip.title}</span> {tr("Ушбу клипни юклаб олиш ёки тўлиқ кўриш учун тўловни амалга оширинг:", "Ushbu klipni yuklab olish yoki to'liq ko'rish uchun to'lovni amalga oshiring:", "Совершите оплату для скачивания или полного просмотра этого клипа:", "Make a payment to download or fully watch this clip:")}
                            </p>
                        </div>

                        <div className="bg-slate-950/60 p-4 rounded-2xl border border-white/5 flex items-center justify-between">
                            <span className="text-xs text-slate-400">{tr("Нархи:", "Narxi:", "Цена:", "Price:")}</span>
                            <span className="text-sm font-black text-amber-400">{pendingClip.price || 10000} {tr("сўм", "so'm", "сум", "sum")}</span>
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
                                    alert(tr("Тўлов тизимига ўтиш...", "To'lov tizimiga o'tish...", "Переход к платежной системе...", "Redirecting to payment system..."));
                                    setShowPaymentModal(false);
                                }}
                                className="w-1/2 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition shadow-lg cursor-pointer"
                            >
                                {tr("Тўловни давом эттириш", "To'lovni davom ettirish", "Продолжить оплату", "Proceed to payment")}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}