"use client";
//src\app\dashboard\videos\new\page.tsx
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ArrowLeft, Upload, Loader2, Film, Image as ImageIcon, CheckCircle2, AlertCircle, HardDrive } from "lucide-react";
import { tr } from "@/utils/translate";
import { createVideoAction } from "@/actions/videoActions";
import { precacheUploadedVideo, revokeLocalVideoUrl } from "@/utils/videoDeviceCache";

function formatPercentComma(value: number): string {
  return Math.max(0, Math.min(100, value)).toFixed(4).replace(".", ",");
}

function evaluateVideoConversionNeed(file: File | null, durationSec: number, width: number, height: number): boolean {
  if (!file) return false;
  const lowerName = file.name.toLowerCase();
  const isMp4File = lowerName.endsWith(".mp4") || file.type === "video/mp4";
  if (!isMp4File) return true;
  const sizeBytes = file.size || 0;
  const sizeMb = sizeBytes / (1024 * 1024);
  const isSub480pMp4 = height > 0 && height <= 480 && (width <= 0 || width <= 854) && sizeMb < 180;
  if (isSub480pMp4) return false;
  if (sizeMb <= 90 && (width <= 0 || width <= 1280) && (height <= 0 || height <= 720)) return false;
  const avgBitrateKbps = sizeBytes > 0 && durationSec > 0 ? (sizeBytes * 8) / (durationSec * 1000) : 0;
  return ((sizeMb > 90 || height > 720 || width > 1280) && avgBitrateKbps > 2717) || (durationSec <= 0 && sizeMb >= 180);
}

export default function NewVideoPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [loading, setLoading] = useState(false);
  const [isServerProcessing, setIsServerProcessing] = useState(false);
  const [serverStage, setServerStage] = useState<"converting" | "sending_telegram">("sending_telegram");
  const [telegramDone, setTelegramDone] = useState(false);
  const [isSavingToDevice, setIsSavingToDevice] = useState(false);
  const [deviceCachePercent, setDeviceCachePercent] = useState<number>(0);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [displayProgress, setDisplayProgress] = useState<number>(0);
  const [serverPercent, setServerPercent] = useState<number>(0);
  const [displayConversionPercent, setDisplayConversionPercent] = useState<number>(0);
  const [successModal, setSuccessModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({ title: "", singer: "", genre: "" });
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoDuration, setVideoDuration] = useState<string>("0:00");
  const [videoDurationSec, setVideoDurationSec] = useState<number>(0);
  const [videoWidth, setVideoWidth] = useState<number>(0);
  const [videoHeight, setVideoHeight] = useState<number>(0);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);

  const needsConversion = evaluateVideoConversionNeed(videoFile, videoDurationSec, videoWidth, videoHeight);

  useEffect(() => {
    if (!loading) {
      setUploadProgress(0);
      setDisplayProgress(0);
      setServerPercent(0);
      setDisplayConversionPercent(0);
      setServerStage(needsConversion ? "converting" : "sending_telegram");
      setIsServerProcessing(false);
      setTelegramDone(false);
      setIsSavingToDevice(false);
      setDeviceCachePercent(0);
    }
  }, [loading, needsConversion]);

  useEffect(() => {
    if (!loading) {
      setDisplayProgress(0);
      return;
    }
    if (isServerProcessing) {
      setDisplayProgress(100);
      return;
    }
    const target = Math.max(0, Math.min(100, uploadProgress));
    if (Math.abs(displayProgress - target) < 0.0001) return;
    const timer = setInterval(() => {
      setDisplayProgress((prev) => {
        if (prev >= target) return target;
        const step = Math.max(0.01, Number(((target - prev) * 0.25).toFixed(4)));
        return prev + step >= target ? target : Number((prev + step).toFixed(4));
      });
    }, 30);
    return () => clearInterval(timer);
  }, [uploadProgress, displayProgress, loading, isServerProcessing]);

  useEffect(() => {
    if (!loading || !isServerProcessing) {
      if (!loading) setDisplayConversionPercent(0);
      return;
    }
    if (telegramDone) {
      setDisplayConversionPercent(100);
      return;
    }
    const timer = setInterval(() => {
      setDisplayConversionPercent((prev) => {
        const effectiveTarget = serverPercent >= 99.9999 ? 100 : Math.min(99.9999, Math.max(prev + 0.0002, serverPercent));
        if (prev >= effectiveTarget) return effectiveTarget;
        const delta = effectiveTarget - prev;
        const step = Math.max(0.0002, Number((delta * 0.08).toFixed(4)));
        return prev + step >= effectiveTarget ? effectiveTarget : Number((prev + step).toFixed(4));
      });
    }, 50);
    return () => clearInterval(timer);
  }, [serverPercent, loading, isServerProcessing, telegramDone]);

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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setVideoFile(file);
    setVideoDuration("0:00");
    setVideoDurationSec(0);
    setVideoWidth(0);
    setVideoHeight(0);
    const tempUrl = URL.createObjectURL(file);
    const tempVideo = document.createElement("video");
    tempVideo.preload = "metadata";
    tempVideo.onloadedmetadata = () => {
      const totalSec = Math.floor(tempVideo.duration || 0);
      setVideoDurationSec(totalSec);
      setVideoWidth(Number(tempVideo.videoWidth || 0));
      setVideoHeight(Number(tempVideo.videoHeight || 0));
      const h = Math.floor(totalSec / 3600), m = Math.floor((totalSec % 3600) / 60), s = totalSec % 60;
      setVideoDuration(h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`);
      revokeLocalVideoUrl(tempUrl);
    };
    tempVideo.onerror = () => {
      setVideoDuration("0:00");
      setVideoDurationSec(0);
      setVideoWidth(0);
      setVideoHeight(0);
      revokeLocalVideoUrl(tempUrl);
    };
    tempVideo.src = tempUrl;
  };

  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setCoverPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoFile) {
      setError(tr("Илтимос, видеофайлни танланг", "Iltimos, videofaylni tanlang", "Пожалуйста, выберите видеофайл", "Please select a video file"));
      return;
    }
    const authorId = session?.user?.id;
    if (!authorId) {
      setError(tr("Фойдаланувчи авторизациядан ўтмаган", "Foydalanuvchi avtorizatsiyadan o'tmagan", "Пользователь не авторизован", "User not authorized"));
      return;
    }
    const uploadId = `up_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const shouldConvertOnSubmit = evaluateVideoConversionNeed(videoFile, videoDurationSec, videoWidth, videoHeight);
    setLoading(true);
    setIsServerProcessing(false);
    setTelegramDone(false);
    setIsSavingToDevice(false);
    setDeviceCachePercent(0);
    setServerStage(shouldConvertOnSubmit ? "converting" : "sending_telegram");
    setServerPercent(0);
    setDisplayConversionPercent(0);
    setUploadProgress(0);
    setDisplayProgress(0);
    setError(null);

    const tempCachePromise = precacheUploadedVideo(uploadId, videoFile).catch(() => {});
    let pollTimeout: ReturnType<typeof setTimeout> | null = null;
    let isFinalizing = false;
    let pollStopped = false;

    const stopServerPolling = () => {
      pollStopped = true;
      if (pollTimeout) {
        clearTimeout(pollTimeout);
        pollTimeout = null;
      }
    };

    const finalizeVideoCreation = async (uploadResult: { messageId?: number; telegramMessageId?: number; fileId?: string; url?: string }) => {
      if (isFinalizing) return;
      isFinalizing = true;
      stopServerPolling();
      try {
        const msgId = uploadResult.messageId || uploadResult.telegramMessageId;
        if (!msgId) throw new Error("Сервер не вернул messageId загруженного видео");
        setTelegramDone(true);
        setServerPercent(100);
        setDisplayConversionPercent(100);
        setUploadProgress(100);
        setDisplayProgress(100);
        setIsSavingToDevice(true);
        setDeviceCachePercent(10);
        const generatedTelegramUrl = uploadResult.url || `https://t.me/uzbekistonovozi_video/${msgId}`;
        const result = await createVideoAction({
          title: formData.title,
          singer: formData.singer,
          genre: formData.genre,
          duration: videoDuration,
          cover: coverPreview || "/default-cover.webp",
          telegramUrl: generatedTelegramUrl,
          authorId,
          fileId: uploadResult.fileId || generatedTelegramUrl,
        } as any);
        if (!result || !result.success) {
          throw new Error(result?.errorCode || "Server error");
        }
        setDeviceCachePercent(35);
        if (result.videoId && videoFile) {
          await tempCachePromise;
          setDeviceCachePercent(70);
          await precacheUploadedVideo(result.videoId, videoFile);
        }
        setDeviceCachePercent(100);
        await new Promise((r) => setTimeout(r, 250));
        setLoading(false);
        setSuccessModal(true);
        setTimeout(() => {
          router.push("/dashboard");
          router.refresh();
        }, 1500);
      } catch (err: unknown) {
        setIsSavingToDevice(false);
        setError(err instanceof Error ? err.message : "Произошла ошибка при сохранении видео");
        setLoading(false);
      }
    };

    const startServerPolling = () => {
      if (isFinalizing || pollStopped) return;
      setUploadProgress(100);
      setDisplayProgress(100);
      setIsServerProcessing(true);
      setServerStage(shouldConvertOnSubmit ? "converting" : "sending_telegram");
      if (pollTimeout) return;
      const tick = async () => {
        if (isFinalizing || pollStopped) return;
        try {
          const res = await fetch(`/api/upload/progress/${uploadId}`, { cache: "no-store" });
          if (res.ok) {
            const data = await res.json();
            if (data.stage === "error") {
              stopServerPolling();
              setError(data.detail || "Ошибка обработки видео на сервере");
              setLoading(false);
              return;
            }
            if (data.stage === "sending_telegram") setServerStage("sending_telegram");
            else if (data.stage === "converting" && shouldConvertOnSubmit) setServerStage("converting");
            if (typeof data.percent === "number" && !Number.isNaN(data.percent)) {
              setServerPercent((prev) => Math.max(prev, Math.max(0, Math.min(100, data.percent))));
            }
            if (data.stage === "done" && data.result) {
              await finalizeVideoCreation(data.result);
              return;
            }
          }
        } catch {}
        if (!isFinalizing && !pollStopped) {
          pollTimeout = setTimeout(tick, 500);
        }
      };
      void tick();
    };

    const uploadFormData = new FormData();
    uploadFormData.append("file", videoFile);
    uploadFormData.append("type", "video");
    if (coverFile) uploadFormData.append("cover", coverFile);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload", true);
    xhr.setRequestHeader("x-upload-id", uploadId);
    xhr.timeout = 0;
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      if (event.loaded >= event.total) {
        startServerPolling();
        return;
      }
      setUploadProgress(Number(((event.loaded / event.total) * 100).toFixed(4)));
    };
    xhr.upload.onload = () => startServerPolling();
    xhr.onload = async () => {
      if (xhr.status === 202) {
        startServerPolling();
        return;
      }
      stopServerPolling();
      if (xhr.status === 200) {
        try {
          const uploadData = JSON.parse(xhr.responseText);
          if (!uploadData.success || !uploadData.messageId) throw new Error(uploadData.error || "Ошибка загрузки файла в Telegram");
          await finalizeVideoCreation(uploadData);
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : "Произошла ошибка");
          setLoading(false);
        }
      } else {
        try {
          setError(JSON.parse(xhr.responseText).error || "Ошибка загрузки видео");
        } catch {
          setError("Ошибка загрузки видео на сервер");
        }
        setLoading(false);
      }
    };
    xhr.onerror = () => {
      stopServerPolling();
      setError("Произошла сетевая ошибка при загрузке");
      setLoading(false);
    };
    xhr.send(uploadFormData);
  };

  const GradientBorder = () => (
    <div
      className="absolute inset-0 rounded-xl z-0 shadow-[0_0_20px_rgba(57,255,20,0.3)] transition-all duration-500 group-hover:shadow-[inset_0_0_20px_rgba(0,0,0,1)] pointer-events-none"
      style={{
        padding: "2px",
        background: "linear-gradient(to right, #000000, #FFDA09, #39FF14, #FFDA09, #000000)",
        WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
        WebkitMaskComposite: "xor",
        maskComposite: "exclude",
      }}
    />
  );

  const formattedServerUploadPercent = formatPercentComma(displayProgress);
  const formattedConversionPercent = formatPercentComma(displayConversionPercent);
  const formattedDevicePercent = formatPercentComma(deviceCachePercent);
  const showBottomConversionCounter = Boolean(loading && isServerProcessing);
  const isActuallyConverting = needsConversion && serverStage === "converting";

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-6 md:p-12 relative font-sans">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <div className="relative rounded-xl inline-block group">
            <Link href="/dashboard" className="relative z-10 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-neutral-400 hover:text-white text-sm bg-neutral-950 transition">
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
            <h1 className="text-lg sm:text-xl text-amber-400 mb-1">{tr("Янги видео клип қўшиш", "Yangi video klip qo'shish", "Добавить новый видеоклип", "Add new video clip")}</h1>
            <p className="text-sm text-neutral-400 mb-4">{tr("Видеофайлни телефон ёки компютерингиздан танланг.", "Videofaylni telefon yoki kompyuteringizdan tanlang.", "Выберите видеофайл с телефона или компьютера.", "Select a video file from your phone or computer.")}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">{tr("Видео номи", "Video nomi", "Название видео", "Video title")} *</label>
            <input type="text" name="title" required disabled={loading} placeholder={tr("Масалан: Konsert 2026", "Masalan: Konsert 2026", "Например: Концерт 2026", "Example: Concert 2026")} value={formData.title} onChange={handleChange} className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm placeholder-neutral-500 focus:outline-none focus:border-amber-400 transition disabled:opacity-50" />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">{tr("Ижрочи / Хонанда", "Ijrochi / Xonanda", "Исполнитель / Певец", "Singer")} *</label>
            <input type="text" name="singer" required disabled={loading} placeholder={tr("Фарруҳ Закиров", "Farruh Zakirov", "Фаррух Закиров", "Farruh Zakirov")} value={formData.singer} onChange={handleChange} className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm placeholder-neutral-500 focus:outline-none focus:border-amber-400 transition disabled:opacity-50" />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">{tr("Жанр", "Janr", "Жанр", "Genre")}</label>
            <input type="text" name="genre" disabled={loading} placeholder={tr("Масалан: Live, Clip", "Masalan: Live, Clip", "Например: Live, Clip", "Example: Live, Clip")} value={formData.genre} onChange={handleChange} className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm placeholder-neutral-500 focus:outline-none focus:border-amber-400 transition disabled:opacity-50" />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">{tr("Видео муқоваси (расм)", "Video muqovasi (rasm)", "Обложка видео (изображение)", "Video cover (image)")}</label>
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 relative rounded-xl bg-neutral-950 border border-neutral-800 overflow-hidden flex items-center justify-center shrink-0">
                {coverPreview ? <img src={coverPreview} alt="Preview" className="absolute inset-0 w-full h-full object-cover" /> : <ImageIcon className="w-5 h-5 text-neutral-600" />}
              </div>
              <div className={`relative rounded-xl inline-block group ${loading ? "opacity-50 pointer-events-none" : ""}`}>
                <label className="relative z-10 cursor-pointer bg-neutral-950 text-neutral-300 hover:text-white text-xs font-semibold px-4 py-2.5 rounded-xl transition inline-block">
                  <span>{tr("Муқова танлаш", "Muqova tanlash", "Выбрать обложку", "Select cover")}</span>
                  <input type="file" accept="image/*" disabled={loading} className="hidden" onChange={handleCoverChange} />
                </label>
                <GradientBorder />
              </div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">{tr("Видеофайл тез юкланиши учун, видео .mp4 форматида бўлиши керак. Бошқа видео формат, автоматик равишда MP-4 форматига ўтказилади. Конвертация вақт талаб қилади. Конвертация тугамагунча, Саҳифани ёпманг.", "Videofayl tez yuklanishi uchun,video .mp4 formatida bo'lishi kerak. Boshqa video format, avtomatik ravishda MP-4 formatiga q'tkaziladi. Konvertasiya vaqt talab qiladi. Konvertasiya tugamaguncha, Sahifani yopmang.", "Для быстрой загрузки Видеофайла, оно должно быть в формате .mp4. При другом формате будет сделано авто-конвертация в МР-4. Не закрывайте вкладку во время процесса конвертации.", "For fast video file loading, it must be in .mp4 format. If it’s in another format, auto‑conversion will be performed. Do not close the tab during the process.")} *</label>
            <div className="flex items-center gap-4 bg-neutral-950 border border-neutral-800 rounded-xl p-4">
              <div className="w-10 h-10 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center text-amber-400 shrink-0"><Film size={20} /></div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{videoFile ? videoFile.name : tr("Файл танланмаган", "Fayl tanlanmagan", "Файл не выбран", "No file selected")}</p>
                <p className="text-xs text-neutral-500">{videoFile ? `${(videoFile.size / (1024 * 1024)).toFixed(2)} MB • ${videoDuration}` : tr("Ҳажми чекланган (2 ГБ гача)", "Hajmi cheklangan (2 GB gacha)", "Ограничение (до 2 ГБ)", "Limit to 2 GB")}</p>
              </div>
              <label className={`cursor-pointer bg-neutral-900 hover:bg-neutral-800 text-amber-400 text-xs font-semibold px-4 py-2.5 rounded-xl transition inline-block shrink-0 ${loading ? "opacity-50 pointer-events-none" : ""}`}>
                <span>{tr("Видео танлаш", "Video tanlash", "Выбрать видео", "Select video")}</span>
                <input type="file" accept="video/*" required disabled={loading} className="hidden" onChange={handleVideoChange} />
              </label>
            </div>
          </div>
          {loading && (
            <div className="space-y-3 bg-neutral-950 border border-neutral-800 p-4 rounded-xl">
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-neutral-300">
                  <span>
                    {isServerProcessing
                      ? isActuallyConverting
                        ? tr("Файл текширилди. .mp4 форматига Конвертация қилиш керак...", "Fayl tekshirildi. .mp4 formatiga Konvertatsiya qilish kerak...", "Файл проверен. Необходимо Выполнить конвертацию в формат .mp4...", "File verified. Converting to .mp4...")
                        : tr("Тайёр .mp4 файл текширилди. Конвертациясиз Telegram каналга юборилмоқда...", "Tayyor .mp4 fayl tekshirildi. Konvertatsiyasiz Telegram kanalga yuborilmoqda...", "Готовый .mp4 файл проверен. Отправляется в Telegram-канал без конвертации...", "Ready .mp4 file verified. Sending to Telegram channel without conversion...")
                      : tr("Файл текширилмоқда...", "Fayl tekshirilmoqda...", "Проверка файла...", "Checking the file...")}
                  </span>
                  <span className="font-bold text-amber-400 tabular-nums">{formattedServerUploadPercent}%</span>
                </div>
                <div className="w-full bg-neutral-900 rounded-full h-3 overflow-hidden border border-neutral-800">
                  <div className="bg-amber-400 h-full" style={{ width: `${displayProgress}%` }} />
                </div>
              </div>
              {showBottomConversionCounter && (
                <div className="pt-2 border-t border-neutral-800/80 space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-amber-300">
                    <span>
                      {telegramDone
                        ? tr("Telegram каналга юборилди", "Telegram kanalga yuborildi", "Загрузка в Telegram завершена", "Telegram upload finished")
                        : isActuallyConverting
                          ? tr("MP-4 форматига Конвертация қилинмоқда. Конвертация жараёни... ", "MP-4 formatiga Konvertasiya qilinmoda. Konvertatsiya jarayoni... ", "Идёт конвертации... Идет конвертация в .mp4 формат", "Conversion progress...")
                          : tr("Telegram каналга юборилмоқда...", "Telegram kanalga yuborilmoqda...", "Отправка в Telegram-канал...", "Sending to Telegram channel...")}
                    </span>
                    <span className="font-bold text-amber-400 tabular-nums">{formattedConversionPercent}%</span>
                  </div>
                  <div className="w-full bg-neutral-900 rounded-full h-2 overflow-hidden border border-neutral-800">
                    <div className="bg-amber-400 h-full" style={{ width: `${displayConversionPercent}%` }} />
                  </div>
                </div>
              )}
              {(isSavingToDevice || telegramDone) && (
                <div className="pt-2 border-t border-neutral-800/80 space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-emerald-300">
                    <span className="flex items-center gap-1.5">
                      <HardDrive size={14} className="text-emerald-400 shrink-0" />
                      <span>{tr("Қурилма хотирасига сақланмоқда...", "Qurilma xotirasiga saqlanmoqda...", "Сохранение на устройство пользователя...", "Saving to user device...")}</span>
                    </span>
                    <span className="font-bold text-emerald-400 tabular-nums">{formattedDevicePercent}%</span>
                  </div>
                  <div className="w-full bg-neutral-900 rounded-full h-2.5 overflow-hidden border border-neutral-800">
                    <div className="bg-emerald-400 h-full" style={{ width: `${deviceCachePercent}%` }} />
                  </div>
                </div>
              )}
              {isServerProcessing && !telegramDone && (
                <p className="text-[11px] text-amber-300/80 pt-1">{tr("*Диққат! Фақат MP4 файл Конвертациясиз тўғридан-тўғри юборилади. Бошқа форматлар 720p H.264 га келтирилади. Саҳифани ёпманг.", "*Diqqat! Faqat MP4 fayl Konvertasiyasiz to'g'ridan-to'g'ri yuboriladi. Boshqa formatlar 720p H.264 ga keltiriladi. Sahifani yopmang.", "*Внимание! Только MP4 файл отправляется напрямую без перекодирования. Несовместимый формат приводится к 720p H.264. Не закрывайте страницу.", "*Ready MP4 is sent directly without re-encoding. Incompatible formats are converted to 720p H.264. Do not close the page.")}</p>
              )}
            </div>
          )}
          <div className="pt-2 flex justify-end">
            <div className={`relative rounded-xl inline-block group w-full ${loading ? "opacity-50 pointer-events-none" : ""}`}>
              <button type="submit" disabled={loading} className="relative z-10 flex items-center justify-center gap-2 bg-neutral-950 text-amber-400 hover:text-amber-300 font-semibold px-6 py-3.5 rounded-xl transition w-full cursor-pointer">
                {loading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    <span>
                      {isSavingToDevice
                        ? tr("Қурилмага сақланмоқда...", "Qurilmaga saqlanmoqda...", "Сохранение на устройство...", "Saving to device...")
                        : isServerProcessing
                          ? (isActuallyConverting ? tr("Конвертация қилинмоқда...", "Konvertatsiya qilinmoqda...", "Конвертация...", "Converting...") : tr("Telegram каналга юборилмоқда...", "Telegram kanalga yuborilmoqda...", "Отправка в Telegram-канал...", "Sending to Telegram channel..."))
                          : tr("Юкланмоқда...", "Yuklanmoqda...", "Загрузка...", "Uploading...")}
                    </span>
                  </>
                ) : (
                  <>
                    <Upload size={18} />
                    <span>{tr("Видеони юклаш", "Videoni yuklash", "Загрузить видео", "Upload video")}</span>
                  </>
                )}
              </button>
              <GradientBorder />
            </div>
          </div>
        </form>
      </div>
      {successModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-emerald-500/30 rounded-2xl p-6 max-w-sm w-full text-center space-y-4">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
            <h2 className="text-lg font-bold text-white">{tr("Видео муваффақиятли қўшилди!", "Video muvaffaqiyatli qo'shildi!", "Видео успешно добавлено!", "Video added successfully!")}</h2>
            <p className="text-xs text-neutral-400">{tr("Кабинетга йўналтирилмоқда...", "Kabinetga yo'naltirilmoqda...", "Перенаправление в кабинет...", "Redirecting to dashboard...")}</p>
          </div>
        </div>
      )}
    </div>
  );
}