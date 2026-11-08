"use client";
//src\app\dashboard\videos\new\page.tsx
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ArrowLeft, Upload, Loader2, Film, Image as ImageIcon, CheckCircle2, AlertCircle } from "lucide-react";
import { tr } from "@/utils/translate";
import { createVideoAction } from "@/actions/videoActions";

export default function NewVideoPage() {
    const router = useRouter();
    const { data: session } = useSession();
    const [loading, setLoading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<string>("0.0000");
    const [displayProgress, setDisplayProgress] = useState<number>(0); // 👈 Плавное значение для анимации
    const [successModal, setSuccessModal] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [formData, setFormData] = useState({
        title: "",
        singer: "",
        genre: "",
    });

    const [videoFile, setVideoFile] = useState<File | null>(null);
    const [coverFile, setCoverFile] = useState<File | null>(null);
    const [coverPreview, setCoverPreview] = useState<string | null>(null);

    // Плавное догоняние реального прогресса для непрерывной анимации цифр
    useEffect(() => {
        if (!loading) {
            setDisplayProgress(0);
            return;
        }

        const target = parseFloat(uploadProgress);
        if (displayProgress >= target) return;

        const timer = setTimeout(() => {
            const nextVal = displayProgress + (target - displayProgress) * 0.15;
            setDisplayProgress(nextVal > target ? target : nextVal);
        }, 25); // Обновляем каждые 25 миллисекунд для идеальной плавности

        return () => clearTimeout(timer);
    }, [uploadProgress, displayProgress, loading]);

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

    const handleVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) setVideoFile(file);
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
        if (!videoFile) {
            setError(tr(
                "Илтимос, видеофайлро танланг",
                "Iltimos, videofaylni tanlang",
                "Пожалуйста, выберите видеофайл",
                "Please select a video file"
            ));
            return;
        }

        const authorId = session?.user?.id;
        if (!authorId) {
            setError(tr(
                "Фойдаланувчи авторизациядан ўтмаган",
                "Foydalanuvchi avtorizatsiyadan o'tmagan",
                "Пользователь не авторизован",
                "User not authorized"
            ));
            return;
        }

        setLoading(true);
        setUploadProgress("0.0000");
        setDisplayProgress(0);
        setError(null);

        const uploadFormData = new FormData();
        uploadFormData.append("file", videoFile);
        uploadFormData.append("type", "video");

        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/upload", true);
        xhr.timeout = 0; // Бесконечный таймаут для больших видео до 2 ГБ

        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
                const percentComplete = ((event.loaded / event.total) * 100).toFixed(4);
                setUploadProgress(percentComplete);
            }
        };

        xhr.onload = async () => {
            if (xhr.status === 200) {
                try {
                    const uploadData = JSON.parse(xhr.responseText);
                    if (!uploadData.success || !uploadData.messageId) {
                        throw new Error(uploadData.error || "Ошибка загрузки файла в Telegram");
                    }

                    const channelUsername = "uzbekistonovozi_video";
                    const generatedTelegramUrl = `https://t.me/${channelUsername}/${uploadData.messageId}`;

                    const result = await createVideoAction({
                        title: formData.title,
                        singer: formData.singer,
                        genre: formData.genre,
                        duration: "3:45",
                        cover: coverPreview || "/default-cover.webp",
                        telegramUrl: generatedTelegramUrl,
                        authorId: authorId,
                        fileId: uploadData.fileId,
                    } as any);

                    if (!result || !result.success) {
                        throw new Error(result?.errorCode || "Server error");
                    }

                    setDisplayProgress(100);
                    setLoading(false);
                    setSuccessModal(true);

                    setTimeout(() => {
                        router.push("/dashboard");
                        router.refresh();
                    }, 1500);

                } catch (err: unknown) {
                    const message = err instanceof Error ? err.message : "Произошла ошибка";
                    setError(message);
                    setLoading(false);
                }
            } else {
                try {
                    const errRes = JSON.parse(xhr.responseText);
                    setError(errRes.error || "Ошибка загрузки видео");
                } catch {
                    setError("Ошибка загрузки видео на сервер");
                }
                setLoading(false);
            }
        };

        xhr.onerror = () => {
            setError("Произошла сетевая ошибка при загрузке");
            setLoading(false);
        };

        xhr.send(uploadFormData);
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
                            {tr("Янги видео клип қўшиш", "Yangi video klip qo'shish", "Добавить новый видеоклип", "Add new video clip")}
                        </h1>
                        <p className="text-sm text-neutral-400 mb-4">
                            {tr(
                                "Видеофайлро компютерингиздан танланг. У автоматик тарзда Telegram каналимизга юкланади.",
                                "Videofaylni kompyuteringizdan tanlang. U avtomatik ravishda Telegram kanalimizga yuklanadi.",
                                "Выберите видеофайл с компьютера. Он автоматически загрузится в наш Telegram-канал.",
                                "Select a video file from your computer. It will automatically upload to our Telegram channel."
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
                            {tr("Видеофайл (.mp4)", "Videofayl (.mp4)", "Видеофайл (.mp4)", "Video file (.mp4)")} *
                        </label>
                        <div className="flex items-center gap-4 bg-neutral-950 border border-neutral-800 rounded-xl p-4">
                            <div className="w-10 h-10 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center text-amber-400 shrink-0">
                                <Film size={20} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm text-white truncate">
                                    {videoFile ? videoFile.name : tr("Файл танланмаган", "Fayl tanlanmagan", "Файл не выбран", "No file selected")}
                                </p>
                                <p className="text-xs text-neutral-500">
                                    {videoFile ? `${(videoFile.size / (1024 * 1024)).toFixed(2)} MB` : tr("Ҳажми чекланмаган (2 ГБ гача)", "Hajmi cheklanmagan (2 GB gacha)", "Без ограничений (до 2 ГБ)", "Up to 2 GB")}
                                </p>
                            </div>
                            <label className={`cursor-pointer bg-neutral-900 hover:bg-neutral-800 text-amber-400 text-xs font-semibold px-4 py-2.5 rounded-xl transition inline-block shrink-0 ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
                                <span>{tr("Видео танлаш", "Video tanlash", "Выбрать видео", "Select video")}</span>
                                <input
                                    type="file"
                                    accept="video/mp4,video/*"
                                    required
                                    disabled={loading}
                                    className="hidden"
                                    onChange={handleVideoChange}
                                />
                            </label>
                        </div>
                    </div>

                    {/* ВИЗУАЛЬНЫЙ ПЛАВНЫЙ ПРОГРЕСС-БАР ЗАГРУЗКИ */}
                    {loading && (
                        <div className="space-y-2 bg-neutral-950 border border-neutral-800 p-4 rounded-xl">
                            <div className="flex justify-between text-xs text-neutral-300">
                                <span>{tr("Юкланмоқда...", "Yuklanmoqda...", "Идет Загрузка...", "Uploading...")}</span>
                                <span className="font-bold text-amber-400">{displayProgress.toFixed(4)}%</span>
                            </div>
                            <div className="w-full bg-neutral-900 rounded-full h-3 overflow-hidden border border-neutral-800">
                                <div
                                    className="bg-amber-400 h-full transition-all duration-75"
                                    style={{ width: `${displayProgress}%` }}
                                />
                            </div>
                        </div>
                    )}

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
                                        <span>{tr(`Юкланмоқда... Тугашини кутинг: ${displayProgress.toFixed(4)}%`, `Yuklanmoqda: ${displayProgress.toFixed(4)}%`, `Загрузка: ${displayProgress.toFixed(4)}%`, `Uploading: ${displayProgress.toFixed(4)}%`)}</span>
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
                            {tr("Видео каналга юкланди ва сақланди...", "Video kanalga yuklandi va saqlandi...", "Видео загружено в канал и сохранено...", "Video uploaded to channel...")}
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}