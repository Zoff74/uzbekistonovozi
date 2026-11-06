// src/app/dashboard/videos/new/page.tsx
"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Upload, Loader2, Link as LinkIcon, Image as ImageIcon, CheckCircle2, AlertCircle } from "lucide-react";
import { tr } from "@/utils/translate";

export default function NewVideoPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [successModal, setSuccessModal] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [formData, setFormData] = useState({
        title: "",
        singer: "",
        genre: "",
        telegramUrl: "",
    });

    const [coverFile, setCoverFile] = useState<File | null>(null);
    const [coverPreview, setCoverPreview] = useState<string | null>(null);

    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (loading) {
                e.preventDefault();
                e.returnValue = "";
            }
        };
        window.addEventListener("beforeunload", handleBeforeUnload);
        return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    }, [loading]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setCoverFile(file);

        const reader = new FileReader();
        reader.onloadend = () => {
            setCoverPreview(reader.result as string);
        };
        reader.readAsDataURL(file);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.telegramUrl.trim()) {
            setError(tr(
                "Илтимос, Telegram видео ҳаволасини киритинг",
                "Iltimos, Telegram video havolasini kiriting",
                "Пожалуйста, введите ссылку на видео из Telegram",
                "Please enter the Telegram video link"
            ));
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const metadataFormData = new FormData();
            metadataFormData.append("title", formData.title);
            metadataFormData.append("singer", formData.singer);
            metadataFormData.append("genre", formData.genre);
            metadataFormData.append("duration", "3:45"); // Дефолтное значение на бэке, раз уж юзеру не нужно его вводить
            metadataFormData.append("telegramUrl", formData.telegramUrl);
            
            if (coverFile) {
                metadataFormData.append("cover", coverFile);
            }

            const response = await fetch("/api/videos", {
                method: "POST",
                body: metadataFormData,
            });

            const responseText = await response.text();
            let result;
            try {
                result = responseText ? JSON.parse(responseText) : {};
            } catch {
                throw new Error(`Сервер хатоси (HTTP ${response.status}): ${responseText || 'Бўш жавоб'}`);
            }

            if (!response.ok || !result.success) {
                throw new Error(result.message || result.error || `Сервер хатоси: HTTP ${response.status}`);
            }

            setLoading(false);
            setSuccessModal(true);

            setTimeout(() => {
                router.push("/dashboard");
                router.refresh();
            }, 1500);

        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : tr(
                "Хатолик юз берди",
                "Xatolik yuz berdi",
                "Произошла ошибка",
                "An error occurred"
            );
            setError(message);
            setLoading(false);
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

    return (
        <div className="min-h-screen bg-neutral-950 text-white p-6 md:p-12 relative font-sans">
            <div className="max-w-3xl mx-auto space-y-6">
                <div>
                    <div className="relative rounded-xl inline-block group">
                        <Link
                            href="/dashboard"
                            className="relative z-10 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-neutral-400 hover:text-white text-sm bg-neutral-950 transition"
                        >
                            <ArrowLeft size={16} />
                            <span>{tr("Орқага қайтиш", "Orqaga qaytish", "Вернуться назад", "Back to dashboard")}</span>
                        </Link>
                        <GradientBorder />
                    </div>
                </div>

                {error && (
                    <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl text-sm flex items-center gap-2">
                        <AlertCircle size={16} className="shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6 bg-neutral-900 border border-neutral-800 rounded-2xl p-6 md:p-10 shadow-xl">
                    <div>
                        <h1 className="text-lg sm:text-xl text-amber-400 mb-1">
                            {tr("Telegram видео ҳаволасини қўшиш", "Telegram video havolasini qo'shish", "Добавить ссылку на видео из Telegram", "Add Telegram video link")}
                        </h1>
                        <p className="text-sm text-neutral-400 mb-4">
                            {tr(
                                "Видеофайлингизни ўзингизнинг Telegram каналингизга юкланг ва у ердан пост ҳаволасини олиб шу ерга қўйинг.",
                                "Videofaylingizni o'zingizning Telegram kanalingizga yuklang va u yerdan post havolasini olib shu yerga qo'ying.",
                                "Загрузите видеофайл в свой Telegram-канал, скопируйте ссылку на пост и вставьте её сюда.",
                                "Upload your video file to your Telegram channel, copy the post link, and paste it here."
                            )}
                        </p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-neutral-300 mb-2">
                            {tr("Видео номи", "Video nomi", "Название видео", "Video title")} *
                        </label>
                        <input
                            type="text"
                            name="title"
                            required
                            disabled={loading}
                            placeholder={tr("Масалан: Konsert 2026", "Masalan: Konsert 2026", "Например: Концерт 2026", "Example: Concert 2026")}
                            value={formData.title}
                            onChange={handleChange}
                            className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm placeholder-neutral-500 focus:outline-none focus:border-amber-400 transition disabled:opacity-50"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-neutral-300 mb-2">
                            {tr("Ижрочи / Хонанда", "Ijrochi / Xonanda", "Исполнитель / Певец", "Singer")} *
                        </label>
                        <input
                            type="text"
                            name="singer"
                            required
                            disabled={loading}
                            placeholder={tr("Фарруҳ Закиров", "Farruh Zakirov", "Фаррух Закиров", "Farruh Zakirov")}
                            value={formData.singer}
                            onChange={handleChange}
                            className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm placeholder-neutral-500 focus:outline-none focus:border-amber-400 transition disabled:opacity-50"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-neutral-300 mb-2">
                            {tr("Жанр", "Janr", "Жанр", "Genre")}
                        </label>
                        <input
                            type="text"
                            name="genre"
                            disabled={loading}
                            placeholder={tr("Масалан: Live, Clip", "Masalan: Live, Clip", "Например: Live, Clip", "Example: Live, Clip")}
                            value={formData.genre}
                            onChange={handleChange}
                            className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm placeholder-neutral-500 focus:outline-none focus:border-amber-400 transition disabled:opacity-50"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-neutral-300 mb-2">
                            {tr("Telegram видео ҳаволаси (URL)", "Telegram video havolasi (URL)", "Ссылка на видео из Telegram (URL)", "Telegram video link (URL)")} *
                        </label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-neutral-500">
                                <LinkIcon size={18} />
                            </div>
                            <input
                                type="url"
                                name="telegramUrl"
                                required
                                disabled={loading}
                                placeholder="https://t.me/your_channel/123"
                                value={formData.telegramUrl}
                                onChange={handleChange}
                                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-11 pr-4 py-3 text-white text-sm placeholder-neutral-600 focus:outline-none focus:border-amber-400 transition disabled:opacity-50 font-mono"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-neutral-300 mb-2">
                            {tr("Видео муқоваси (расм)", "Video muqovasi (rasm)", "Обложка видео (изображение)", "Video cover (image)")}
                        </label>
                        <div className="flex items-center gap-4">
                            <div className="w-14 h-14 relative rounded-xl bg-neutral-950 border border-neutral-800 overflow-hidden flex items-center justify-center shrink-0">
                                {coverPreview ? (
                                    <img src={coverPreview} alt="Preview" className="absolute inset-0 w-full h-full object-cover" />
                                ) : (
                                    <ImageIcon className="w-5 h-5 text-neutral-600" />
                                )}
                            </div>
                            <div className={`relative rounded-xl inline-block group ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
                                <label className="relative z-10 cursor-pointer bg-neutral-950 text-neutral-300 hover:text-white text-xs font-semibold px-4 py-2.5 rounded-xl transition inline-block">
                                    <span>{tr("Муқова танлаш", "Muqova tanlash", "Выбрать обложку", "Select cover")}</span>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        disabled={loading}
                                        className="hidden"
                                        onChange={handleCoverChange}
                                    />
                                </label>
                                <GradientBorder />
                            </div>
                        </div>
                    </div>

                    <div className="pt-2 flex justify-end">
                        <div className={`relative rounded-xl inline-block group w-full ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
                            <button
                                type="submit"
                                disabled={loading}
                                className="relative z-10 flex items-center justify-center gap-2 bg-neutral-950 text-amber-400 hover:text-amber-300 font-semibold px-6 py-2.5 rounded-xl transition duration-200 text-sm cursor-pointer w-full"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="animate-spin" size={16} />
                                        <span>{tr("Сақланмоқда...", "Saqlanmoqda...", "Сохранение...", "Saving...")}</span>
                                    </>
                                ) : (
                                    <>
                                        <Upload size={16} />
                                        <span>{tr("Видеони қўшиш", "Videoni qo'shish", "Опубликовать видео", "Publish video")}</span>
                                    </>
                                )}
                            </button>
                            <GradientBorder />
                        </div>
                    </div>
                </form>
            </div>

            {successModal && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-8 max-w-md w-full text-center space-y-4 shadow-2xl">
                        <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-2xl flex items-center justify-center mx-auto">
                            <CheckCircle2 size={36} />
                        </div>
                        <h2 className="text-xl font-bold text-white">
                            {tr("Муваффақиятли қўшилди!", "Muvaffaqiyatli qo'shildi!", "Успешно добавлено!", "Successfully added!")}
                        </h2>
                        <p className="text-neutral-400 text-sm">
                            {tr("Сабр қилинг. Орқага қайтамиз...", "Sabr qiling. Orqaga qaytamiz...", "Подождите. Возвращаемся назад...", "Please wait. Returning back...")}
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}