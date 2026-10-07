"use client";
// src/app/dashboard/videos/new/page.tsx
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Upload, Loader2, Video as VideoIcon, Image as ImageIcon, CheckCircle2, AlertCircle } from "lucide-react";
import { tr } from "@/utils/translate";

export default function NewVideoPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [successModal, setSuccessModal] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [formData, setFormData] = useState({
        title: "",
        singer: "",
        genre: "",
    });

    const [videoFile, setVideoFile] = useState<File | null>(null);
    const [videoDuration, setVideoDuration] = useState<string>("0:00"); // Состояние для хранения длительности
    const [coverFile, setCoverFile] = useState<File | null>(null);
    const [coverPreview, setCoverPreview] = useState<string | null>(null);

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

    // Функция для автоматического вычисления длительности видео
    const extractVideoDuration = (file: File): Promise<string> => {
        return new Promise((resolve) => {
            const videoElement = document.createElement("video");
            videoElement.preload = "metadata";

            videoElement.onloadedmetadata = () => {
                window.URL.revokeObjectURL(videoElement.src);
                const totalSeconds = Math.floor(videoElement.duration);
                const minutes = Math.floor(totalSeconds / 60);
                const seconds = totalSeconds % 60;
                const formattedDuration = `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
                resolve(formattedDuration);
            };

            videoElement.onerror = () => {
                resolve("0:00");
            };

            videoElement.src = URL.createObjectURL(file);
        });
    };

    const handleVideoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        setVideoFile(file);
        setError(null);

        // Вычисляем длительность при выборе файла
        const duration = await extractVideoDuration(file);
        setVideoDuration(duration);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!videoFile) {
            setError(tr(
                "Илтимос, видеофайлни танланг",
                "Iltimos, videofaylni tanlang",
                "Пожалуйста, выберите видеофайл",
                "Please select a video file"
            ));
            return;
        }

        setLoading(true);
        setError(null);
        setUploadProgress(0);

        try {
            const data = new FormData();
            data.append("title", formData.title);
            data.append("singer", formData.singer);
            data.append("genre", formData.genre);
            data.append("duration", videoDuration); // Передаем вычисленную длительность на бэкенд
            data.append("video", videoFile);
            if (coverFile) {
                data.append("cover", coverFile);
            }

            await new Promise<void>((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open("POST", "/api/videos");
                xhr.timeout = 600000;

                xhr.upload.onprogress = (event) => {
                    if (event.lengthComputable) {
                        const percent = Math.round((event.loaded * 100) / event.total);
                        setUploadProgress(percent);
                    }
                };

                xhr.onload = () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        try {
                            const resData = JSON.parse(xhr.responseText);
                            if (resData.success === false) {
                                reject(new Error(resData.message || "Ошибка сервера"));
                            } else {
                                resolve();
                            }
                        } catch {
                            resolve();
                        }
                    } else {
                        try {
                            const errData = JSON.parse(xhr.responseText);
                            reject(new Error(errData.message || errData.error || `Ошибка: HTTP ${xhr.status}`));
                        } catch {
                            reject(new Error(`Ошибка загрузки: HTTP ${xhr.status}`));
                        }
                    }
                };

                xhr.onerror = () => reject(new Error(tr("Сетевая ошибка при загрузке", "Tarmoq xatoligi", "Сетевая ошибка", "Network error")));
                xhr.ontimeout = () => reject(new Error(tr("Превышено время ожидания", "Vaqt tugadi", "Превышено время ожидания", "Timeout exceeded")));

                xhr.send(data);
            });

            setLoading(false);
            setSuccessModal(true);

            setTimeout(() => {
                router.push("/dashboard");
                router.refresh();
            }, 2000);

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
                            <span>{tr("Дашбордга қайтиш", "Dashboardga qaytish", "Вернуться в дашборд", "Back to dashboard")}</span>
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
                            {tr("Видео юклаш", "Video yuklash", "Загрузка видео", "Upload video")}
                        </h1>
                        <p className="text-sm text-neutral-400">
                            {tr("Видеоингиз учун видеофайл ва муқова юкланг", "Videoingiz uchun videofayl va muqova yuklang", "Загрузите видеофайл и обложку для вашего видео", "Upload video file and cover for your video")}
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

                    <div>
                        <label className="block text-sm font-medium text-neutral-300 mb-2">
                            {tr("Видеофайл (MP4, MOV)", "Videofayl (MP4, MOV)", "Видеофайл (MP4, MOV)", "Video file (MP4, MOV)")} *
                        </label>
                        <div className={`relative rounded-xl group block w-full ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
                            <label className="relative z-10 flex flex-col items-center justify-center w-full h-28 rounded-xl bg-neutral-950 cursor-pointer transition">
                                <div className="flex flex-col items-center justify-center pt-4 pb-4 px-4 text-center">
                                    <VideoIcon className="w-6 h-6 mb-1.5 text-amber-400" />
                                    {videoFile ? (
                                        <div className="space-y-1">
                                            <p className="text-xs text-amber-400 font-medium truncate max-w-xs">
                                                {videoFile.name} <span className="text-neutral-400">({(videoFile.size / (1024 * 1024)).toFixed(1)} MB)</span>
                                            </p>
                                            <p className="text-[11px] text-emerald-400">
                                                {tr("Давомийлиги:", "Davomiyligi:", "Длительность:", "Duration:")} {videoDuration}
                                            </p>
                                        </div>
                                    ) : (
                                        <>
                                            <p className="mb-0.5 text-xs text-neutral-300">
                                                <span className="font-semibold">{tr("Танлаш учун босинг", "Tanlash uchun bosing", "Нажмите для выбора", "Click to select")}</span>
                                            </p>
                                            <p className="text-[11px] text-neutral-500">MP4, MOV</p>
                                        </>
                                    )}
                                </div>
                                <input 
                                    type="file" 
                                    accept="video/*" 
                                    required 
                                    disabled={loading}
                                    className="hidden" 
                                    onChange={handleVideoChange} 
                                />
                            </label>
                            <GradientBorder />
                        </div>
                    </div>

                    {loading && (
                        <div className="space-y-2 bg-neutral-950 p-4 rounded-xl border border-neutral-800">
                            <div className="flex justify-between text-xs text-neutral-400">
                                <span className="flex items-center gap-1.5 text-amber-400 font-medium">
                                    <Loader2 className="animate-spin" size={14} />
                                    {uploadProgress === 100 
                                        ? tr("Серверда сақланмоқда...", "Serverda saqlanmoqda...", "Сохранение на сервере...", "Saving on server...") 
                                        : tr("Файл серверга юкланмоқда...", "Fayl serverga yuklanmoqda...", "Загрузка файла на сервер...", "Uploading file...")}
                                </span>
                                <span className="font-mono text-amber-400 font-bold">{uploadProgress}%</span>
                            </div>
                            <div className="w-full bg-neutral-800 h-2 rounded-full overflow-hidden">
                                <div className="bg-amber-500 h-full transition-all duration-300 ease-out rounded-full" style={{ width: `${uploadProgress}%` }}></div>
                            </div>
                        </div>
                    )}

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
                                        <span>{uploadProgress === 100 ? "Сохранение..." : `Загрузка: ${uploadProgress}%`}</span>
                                    </>
                                ) : (
                                    <>
                                        <Upload size={16} />
                                        <span>{tr("Видеони юклаш", "Videoni yuklash", "Опубликовать видео", "Publish video")}</span>
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
                            {tr("Муваффақиятли юкланди!", "Muvaffaqiyatli yuklandi!", "Успешно загружено!", "Successfully uploaded!")}
                        </h2>
                        <p className="text-neutral-400 text-sm">
                            {tr("Сабр қилинг. Орқага қайтамиз...", "Sabr qiling. Orqaga qaytamiz...", "Подождите. Возвращаемся назад...", "Please wait. Returning back...")}
                        </p>
                        <div className="pt-2">
                            <div className="w-full bg-neutral-800 h-1.5 rounded-full overflow-hidden">
                                <div className="bg-amber-500 h-full animate-[pulse_1s_infinite]"></div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}