"use client";

// БЛОК - "TrackCard" src/components/TrackCard.tsx
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Edit, Trash2 } from "lucide-react";
import { tr } from "@/utils/translate";

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
    };
    onDelete?: (id: string) => void; // 👈 1. Добавили колбэк для мгновенного удаления из списка
}

const FAKE_SEQUENCE = [1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1];
const INTERVAL_MS = 15 * 60 * 1000; // 15 минут

export default function TrackCard({ track, onDelete }: TrackCardProps) {
    const router = useRouter();
    const [isDeleting, setIsDeleting] = useState(false);
    const [showTariffs, setShowTariffs] = useState(false);
    const [isRemoved, setIsRemoved] = useState(false); // 👈 2. Локальный стейт мгновенного скрытия карточки
    const trackId = track._id.toString();

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

    // 👈 3. Если карточка удалена, сразу убираем её из DOM
    if (isRemoved) {
        return null;
    }

    const realPlays = track.plays || 0;
    const displayedPlays = realPlays + fakeOffset;

    // Расчет времени и дней
    const createdAtDate = new Date(track.createdAt || track.expiresAt);
    const expiresDate = new Date(track.expiresAt);
    const now = new Date();

    const hoursSinceCreation = (now.getTime() - createdAtDate.getTime()) / (1000 * 60 * 60);
    const isWithinFirst24Hours = hoursSinceCreation <= 24 && !track.isPaidActive;

    const diffTime = expiresDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // Компонент единой рамки для кнопки удаления
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
            if (res.ok) {
                setIsRemoved(true); // 👈 4. Мгновенно скрываем карточку на клиенте
                if (onDelete) {
                    onDelete(trackId); // 👈 5. Оповещаем родителя, чтобы он тоже вырезал её из массива
                }
                router.refresh();
            } else {
                const data = await res.json();
                alert(data.error || tr("Хатолик юз берди", "Xatolik yuz berdi", "Произошла ошибка", "An error occurred"));
                setIsDeleting(false);
            }
        } catch (err) {
            alert(tr("Сервер билан алоқада хатолик", "Server bilan aloqada xatolik", "Ошибка связи с сервером", "Server connection error"));
            setIsDeleting(false);
        }
    };

    return (
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 sm:p-6 flex flex-col gap-5">
            {/* Карточканинг юқори қисми (Расм + Номи + Ижрочи) */}
            <div className="flex items-start sm:items-center gap-5">
                <img
                    src={track.cover || "/default-cover.webp"}
                    alt={track.title}
                    className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl object-cover border border-neutral-800 shrink-0"
                />
                <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-lg sm:text-xl text-white break-words">
                        {track.title}
                    </h3>
                    <p className="text-base text-neutral-200 mt-1 break-words font-medium">
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

            {/* Вақт ва тарифлар ҳақида маълумот */}
            <div className="flex flex-col gap-3 bg-neutral-950/70 p-4 sm:p-5 rounded-2xl border border-neutral-800/80 text-sm sm:text-base">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className={`inline-block px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-bold ${
                        track.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                    }`}>
                        {track.status === 'ACTIVE' ? tr("Фаол", "Faol", "Активен", "Active") : tr("Муддати тугаган", "Muddati tugagan", "Срок истек", "Expired")}
                    </span>
                    
                    <span className="text-neutral-200 font-semibold">
    {diffDays > 0 
        ? `${tr("Серверда сақланиш вақти:", "Serverda saqlanish vaqti:", "Срок размещения на сайте:", "Time left on site:")} ${diffDays} ${tr("кун", "kun", "дней", "days")}. ${tr(
            "Диққат! 24 соат ичида тўлов қилинмаса, Сизнинг медиа бошқарувингиз тўхтатилади!", 
            "Diqqat! 24 soat ichida to'lov qilinmasa, Sizning media boshqaruvingiz to'xtatiladi!", 
            "Внимание! Если оплата не будет произведена в течение 24 часов, ваше управление медиа будет остановлено!", 
            "Attention! If payment is not made within 24 hours, your media management will be suspended!"
          )}` 
        : tr("Муддат тугади", "Muddat tugadi", "Срок истек", "Term expired")}
</span>
                </div>

                {/* Психологическое предупреждение и блок тарифов (активируется после 24 часов) */}
                {!isWithinFirst24Hours && (
                    <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-xl space-y-3 text-sm sm:text-base">
                        <div className="flex flex-wrap items-center justify-between gap-2 font-bold text-amber-400">
                            <span>⚠️ {tr("Диққат! Бошқарув вақтинча ёпилди:", "Diqqat! Boshqaruv vaqtincha yopildi:", "Внимание! Управление временно закрыто:", "Attention! Management temporarily closed:")}</span>
                            <button 
                                onClick={() => setShowTariffs(!showTariffs)}
                                className="underline hover:text-amber-300 transition text-sm font-semibold cursor-pointer bg-transparent border-none p-0"
                            >
                                {showTariffs ? tr("Тарифларни яшириш", "Tariflarni yashirish", "Скрыть тарифы", "Hide tariffs") : tr("Тарифларни кўриш", "Tariflarni ko'rish", "Посмотреть тарифы", "View tariffs")}
                            </button>
                        </div>

                        <p className="text-neutral-200 leading-relaxed font-medium">
                            {tr(
                                "Вазъият: Трек ҳозир ВАҚТИНЧАЛИК фаол тарзда сайтда трансляция қилинмоқда ва кўришлар йиғмоқда, лекин сиз бошқарув ва статистикага киришни йўқотдингиз. Машҳур бўлиш имкониятини бой берманг — жойлаштиришни ҳозироқ узайтиринг!",
                                "Vaziyat: Trek hozir vaqtincha faol tarzda saytda translyatsiya qilinmoqda va ko'rishlar yig'moqda, lekin siz boshqaruv va statistikaga kirishni yo'qotdingiz. Mashhur bo'lish imkoniyatini boy bermang — joylashtirishni hoziroq uzaytiring!",
                                "Ваш трек сейчас ВРЕМЕННО активно транслируется на сайте и собирает просмотры, но вы потеряли доступ к управлению и статистике. Не упустите свой шанс стать популярным и знаменитым — продлите размещение прямо сейчас!",
                                "Your track is currently temporarily actively broadcast on the site and collecting views, but you have lost access to management and statistics. Don't miss your chance to become popular and famous — extend your placement right now!"
                            )}
                        </p>

                        {/* Тарифлар рўйхати */}
                        {showTariffs && (
                            <div className="pt-3 border-t border-amber-500/20 space-y-2 text-neutral-100">
                                <p className="font-bold text-amber-300">💡 {tr("ПЛАТФОРМА ТАРИФЛАРИ:", "PLATFORMA TARIFLARI:", "ТАРИФЫ ПЛАТФОРМЫ:", "PLATFORM TARIFFS:")}</p>
                                <ul className="list-disc list-inside space-y-1.5 text-neutral-200 pl-1 font-medium">
                                    <li><strong className="text-white">{tr("Базавий тўлов:", "Bazaviy to'lov:", "Базовый платеж:", "Base fee:")}</strong> {tr("Ҳар-бир Қўшиқ жойлаштириш нархи 10 000 сўм (барча пуллик релизлар учун олинади).", "Har-bir Qo'shiq Joylashtirish narxi 10 000 so'm (barcha pullik relizlar uchun olinadi).", "10 000 сум за размещение одной песни (взимается для всех платных релизов).", "10 000 sums for placement (charged for all paid releases).")}</li>
                                    <li><strong className="text-white">{tr("Кунлик тўлов (1 дан 29 кунгача):", "Kunlik to'lov (1 dan 29 kungacha):", "Ежедневно (от 1 до 29 дней):", "Daily (from 1 to 29 days):")}</strong> {tr("Ҳар 24 соат учун 1 000 сўмдан. Қанча кунга жойлаштиришни ўзингиз белгилайсиз", "Xar 24 soat uchun 1 000 so'mdan. Qancha kunga joylashtirishni o'zingiz belgilaysiz", "1 000 сум за каждые 24 часа. Вы сами определяете, на сколько дней разместить", "1 000 sum for every 24 hours. You determine how many days to place")}</li>
                                    <li><strong className="text-white">{tr("Оптом 1 ойга жойлаштириш (30 кун):", "Optom 1 oyga joylashtirish (30 kun):", "Оптовое месячное размешение (30 дней):", "Wholesale monthly (30 days):")}</strong> <span className="text-emerald-400 font-bold">{tr("30 000 сўм", "30 000 so'm", "30 000 сум", "30 000 sum")}</span> {tr("(10 000 сўм чегирма!)", "(10 000 so'm chegirma!)", "(скидка 10 000 сум!)", "(10 000 sum discount!)")}</li>
                                </ul>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Қуйи қисм: Бошқарув тугмалари */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-800/80">
                
                {/* Кнопка: Изменить */}
                <div className="relative h-[42px] group flex items-center justify-center cursor-pointer">
                    <div className="absolute inset-0 bg-gradient-to-r from-black to-gray-600 rounded-lg z-0 shadow-[0_0_15px_rgba(57,255,20,0.15)] transition-all duration-500 group-hover:shadow-[inset_0_0_20px_rgba(0,0,0,1)]" />
                    
                    <Link
                        href={`/dashboard/tracks/${trackId}/edit`}
                        className={`relative h-[34px] z-10 flex items-center justify-center gap-1.5 px-3 rounded-md border-[2px] border-transparent bg-clip-border text-[10px] font-bold uppercase tracking-wider transition-all duration-300 overflow-hidden group-hover:scale-95 group-active:scale-90 bg-black text-[#39FF14] group-hover:text-white whitespace-nowrap ${
                            !isWithinFirst24Hours ? "opacity-50 pointer-events-none" : ""
                        }`}
                        style={{ 
                            borderImageSource: 'linear-gradient(to right, #000000, #FFDA09, #39FF14, #FFDA09, #000000)', 
                            borderImageSlice: 1 
                        }}
                    >
                        <div className="absolute inset-0 w-full h-full pointer-events-none overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#39FF14]/40 to-transparent -translate-x-full group-hover:animate-shimmer" />
                        </div>

                        <Edit size={12} className="relative z-10 text-[#39FF14] group-hover:text-white transition-colors shrink-0" />
                        <span className="relative z-10">
                            {tr("Ўзгартириш", "O'zgartirish", "Изменить", "Edit")}
                        </span>
                    </Link>
                </div>
                
                {/* Кнопка: Удалить трек */}
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

            {/* Глобальные стили для анимаций */}
            <style jsx global>{`
                @keyframes pulse-subtle {
                    0%, 100% { opacity: 1; filter: drop-shadow(0 0 2px rgba(57,255,20,0.2)); }
                    50% { opacity: 0.8; filter: drop-shadow(0 0 8px rgba(57,255,20,0.5)); }
                }
                @keyframes shimmer {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(100%); }
                }
                .animate-pulse-subtle {
                    animation: pulse-subtle 3s infinite ease-in-out;
                }
                .group-hover\:animate-shimmer {
                    animation: shimmer 1.5s infinite ease-in-out;
                }
            `}</style>
        </div>
    );
}