"use client";
// src/app/dashboard/videos/new/page.tsx
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Upload, Loader2, Video as VideoIcon, Image as ImageIcon, CheckCircle2, AlertCircle } from "lucide-react";
import { tr } from "@/utils/translate";

export default function NewVideoPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [statusMessage, setStatusMessage] = useState("");
    const [successModal, setSuccessModal] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [formData, setFormData] = useState({
        title: "",
        singer: "",
        genre: "",
    });

    const [videoFile, setVideoFile] = useState<File | null>(null);
    const [videoDuration, setVideoDuration] = useState<string>("0:00");
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

    const extractVideoDuration = (file: File): Promise<string> => {
        return new Promise((resolve) => {
            if (!file) {
                resolve("0:00");
                return;
            }

            try {
                const videoElement = document.createElement("video");
                videoElement.preload = "metadata";

                const objectUrl = URL.createObjectURL(file);

                videoElement.onloadedmetadata = () => {
                    URL.revokeObjectURL(objectUrl);
                    const totalSeconds = Math.floor(videoElement.duration);
                    if (isNaN(totalSeconds) || !isFinite(totalSeconds)) {
                        resolve("0:00");
                        return;
                    }
                    const minutes = Math.floor(totalSeconds / 60);
                    const seconds = totalSeconds % 60;
                    const formattedDuration = `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
                    resolve(formattedDuration);
                };

                videoElement.onerror = () => {
                    URL.revokeObjectURL(objectUrl);
                    resolve("0:00");
                };

                videoElement.src = objectUrl;
            } catch (err) {
                console.error("Ошибка извлечения длительности видео:", err);
                resolve("0:00");
            }
        });
    };

    const handleVideoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        setVideoFile(file);
        setError(null);

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
        setStatusMessage(tr("Видео серверга юкланмоқда...", "Video serverga yuklanmoqda...", "Загрузка видео на сервер...", "Uploading video to server..."));

        try {
            const uploadedVideo = await new Promise<{ fileId: string; url: string; messageId?: number }>((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open("POST", "/api/upload");
                // Убираем xhr.timeout вообще, чтобы браузер не рубил соединение во время сжатия на сервере

                xhr.upload.onprogress = (event) => {
                    if (event.lengthComputable) {
                        const percentComplete = Math.round((event.loaded / event.total) * 80);
                        setUploadProgress(percentComplete);
                        if (percentComplete >= 80) {
                            setStatusMessage(tr("Сервер видеони кичрайтирмоқда...", "Server videoni kichraitirmoqda...", "Сервер обрабатывает видео...", "Server is processing video..."));
                        }
                    }
                };

                xhr.onload = () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        try {
                            const res = JSON.parse(xhr.responseText);
                            if (res.success && res.fileId) {
                                resolve({ fileId: res.fileId, url: res.url, messageId: res.messageId });
                            } else {
                                reject(new Error(res.error || "Ошибка загрузки или сжатия видео на сервере"));
                            }
                        } catch {
                            reject(new Error(`Ошибка парсинга ответа: ${xhr.responseText || 'пустой ответ'}`));
                        }
                    } else {
                        let detailedError = `HTTP ${xhr.status} (${xhr.statusText || 'Неизвестная ошибка'})`;
                        try {
                            if (xhr.responseText) {
                                const errRes = JSON.parse(xhr.responseText);
                                detailedError = errRes.error || errRes.message || xhr.responseText;
                            }
                        } catch {
                            if (xhr.responseText) {
                                detailedError = xhr.responseText;
                            }
                        }
                        reject(new Error(detailedError));
                    }
                };

                xhr.onerror = () => {
                    reject(new Error("Сетевой сбой (ERR_NETWORK_CHANGED / Обрыв соединения с сервером Render)"));
                };
                // xhr.ontimeout УДАЛЕН, больше никаких ложных "Превышено время ожидания" не будет!

                const data = new FormData();
                data.append("file", videoFile);
                data.append("type", "video");

                xhr.send(data);
            });
            
            setUploadProgress(90);
            setStatusMessage("Сохранение данных в базу...");

            const metadataFormData = new FormData();
            metadataFormData.append("title", formData.title);
            metadataFormData.append("singer", formData.singer);
            metadataFormData.append("genre", formData.genre);
            metadataFormData.append("duration", videoDuration);
            metadataFormData.append("videoFileId", uploadedVideo.fileId);
            metadataFormData.append("videoUrl", uploadedVideo.url);
            
            if (uploadedVideo.messageId) {
                metadataFormData.append("telegramMessageId", uploadedVideo.messageId.toString());
            }
            
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
                throw new Error(`Ошибка сервера (HTTP ${response.status}): ${responseText || 'Пустой ответ'}`);
            }

            if (!response.ok || !result.success) {
                throw new Error(result.message || result.error || `Ошибка сервера: HTTP ${response.status}`);
            }

            setUploadProgress(100);
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

    const isLargeVideo = videoFile && videoFile.size > 48 * 1024 * 1024;

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
                        <div className="space-y-3 bg-neutral-950 p-4 rounded-xl border border-neutral-800">
                            <div className="flex items-start gap-2 text-xs text-neutral-400">
                                <Loader2 className="animate-spin shrink-0 text-amber-400 mt-0.5" size={15} />
                                <div className="space-y-1 text-neutral-300 leading-relaxed">
                                    {isLargeVideo ? (
                                        <>
                                            <p className="text-amber-400 font-medium">
                                                {tr("Видео ҳажми жуда катта. Ҳозир у автоматик равишда кичрайтирилади. Бу жараён Сизнинг интернет тезлигига боғлиқ ва 1 дақиқадан 10 дақиқагача вақт керак бўлиши мумкун...", "Video hajmi juda katta. Hozir u avtomatik ravishda kichraytiriladi. Bu jarayon Sizning internet tezligiga bogliq va 1 daqiqadan 10 daqiqagacha vaqt kerak bo'lishi mumkun...", "Размер видео очень большой. Сейчас оно автоматически сжимается. Это может занять от 1 до 10 минут в зависимости от Вашего скорости интернета...", "Video size is very large. It is currently being compressed automatically. This may take 1 to 10 minutes...")}
                                            </p>
                                            <p className="text-amber-400 text-[12px]">
                                                {tr("Илтимос сабр қилиб тугашини кутинг...", "Iltimos sabr qilib tugashini kuting...", "Пожалуйста, подождите...", "Please wait...")}
                                            </p>
                                        </>
                                    ) : (
                                        <p className="text-amber-400 font-medium">
                                            {tr("Видео юкланмоқда, илтимос кутинг...", "Video yuklanmoqda, iltimos kuting...", "Загрузка видео, пожалуйста подождите...", "Uploading video, please wait...")}
                                        </p>
                                    )}
                                    <p className="text-amber-400/90 font-medium text-[11px] pt-1">
                                        {statusMessage}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 pt-1">
                                <div className="w-full bg-neutral-800 h-2 rounded-full overflow-hidden">
                                    <div className="bg-amber-500 h-full transition-all duration-300 ease-out rounded-full" style={{ width: `${uploadProgress}%` }}></div>
                                </div>
                                <span className="font-mono text-amber-400 font-bold text-xs shrink-0">{uploadProgress}%</span>
                            </div>
                            <p className="text-[11px] text-neutral-400 text-center pt-1">
                                {tr("Жараён тугамагунча ёки хатолик ҳақида маълумот келмагунча саҳифани ёпманг", "Jarayon tugamaguncha yoki xatolik haqida ma'lumot kelmaguncha sahifani yopmang", "Не закрывайте страницу до завершения процесса", "Do not close the page until the process completes")}
                            </p>
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
                                        <span>{uploadProgress === 100 ? "Сақланмоқда..." : `Бажарилмоқда: ${uploadProgress}%`}</span>
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