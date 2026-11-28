"use client";
//src\components\Player.tsx
import { usePlayer } from "@/context/PlayerContext";
import { Play, Pause, Volume2, VolumeX, X, SkipBack, SkipForward, Minimize2, Film, MessageSquare, Music, RotateCcw, HardDrive } from "lucide-react";
import { useRef, useEffect, useState, useCallback, memo } from "react";
import { tr } from "@/utils/translate";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import Discussion from "@/components/Discussion";
import { downloadVideoBeforePlayback, revokeLocalVideoUrl } from "@/utils/videoDeviceCache";

const MemoDiscussion = memo(Discussion);

function formatDownloadPercent(value: number): string {
  return `${Math.max(0, Math.min(100, value)).toFixed(4).replace(".", ",")}%`;
}

export default function Player() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const { currentTrack, isPlaying, togglePlay, closePlayer, nextTrack, prevTrack } = usePlayer();

  const mediaRef = useRef<HTMLAudioElement | HTMLVideoElement | null>(null);
  const lastTimeUpdateRef = useRef<number>(0);
  const activeBlobUrlRef = useRef<string | null>(null);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isMinimizedVideo, setIsMinimizedVideo] = useState(false);
  const [showAudioChatModal, setShowAudioChatModal] = useState(false);
  const [streamError, setStreamError] = useState<boolean>(false);
  const [retryTrigger, setRetryTrigger] = useState<number>(0);
  const [isBuffering, setIsBuffering] = useState<boolean>(false);
  const [isReadingFromDevice, setIsReadingFromDevice] = useState<boolean>(false);
  const [deviceDownloadPercent, setDeviceDownloadPercent] = useState<number>(0);
  const [chatReady, setChatReady] = useState<boolean>(false);
  const [resolvedVideoSrc, setResolvedVideoSrc] = useState<string>("");

  const isAuthenticated = status === "authenticated" && Boolean(session?.user);
  const trackId = String(currentTrack?._id || currentTrack?.id || "").trim();
  const hasVideo = Boolean(currentTrack?.videoUrl || (currentTrack as any)?.telegramUrl || (currentTrack as any)?.videoFileId);

  const detachAndRevokeBlob = useCallback((blobUrl: string | null) => {
    if (!blobUrl) return;
    const el = mediaRef.current;
    if (el && el.tagName === "VIDEO") {
      try {
        el.pause();
        if (el.getAttribute("src") === blobUrl || el.currentSrc === blobUrl) {
          el.removeAttribute("src");
          el.load();
        }
      } catch {}
    }
    setTimeout(() => {
      revokeLocalVideoUrl(blobUrl);
    }, 50);
  }, []);

  const syncAudioState = useCallback(() => {
    const el = mediaRef.current;
    if (!el) return;
    const effectiveVolume = isMuted ? 0 : Math.max(0, Math.min(1, volume));
    if (el.muted !== (isMuted || effectiveVolume === 0)) {
      el.muted = isMuted || effectiveVolume === 0;
    }
    if (Math.abs(el.volume - effectiveVolume) > 0.001) {
      el.volume = effectiveVolume;
    }
  }, [volume, isMuted]);

  const handleChatReady = useCallback(() => {
    console.log("💬 [PLAYER] Чат готов (onReady):", { trackId });
    setChatReady(true);
  }, [trackId]);

  useEffect(() => {
    let active = true;
    const abortController = new AbortController();
    const previousBlobUrl = activeBlobUrlRef.current;
    activeBlobUrlRef.current = null;

    setIsMinimizedVideo(false);
    setStreamError(false);
    setCurrentTime(0);
    setDuration(0);
    setDeviceDownloadPercent(0);
    setIsBuffering(Boolean(trackId && hasVideo));
    setIsReadingFromDevice(Boolean(trackId && hasVideo));
    setChatReady(!hasVideo || !trackId);
    setResolvedVideoSrc("");
    detachAndRevokeBlob(previousBlobUrl);

    console.log("🎬 [PLAYER] Старт эффекта загрузки видео:", { trackId, hasVideo, retryTrigger });

    if (!hasVideo || !trackId) {
      return () => {
        active = false;
        abortController.abort();
      };
    }

    (async () => {
      try {
        console.log("⬇️ [PLAYER] Проверка локального кэша / загрузка на устройство перед показом:", trackId);
        const downloadResult = await downloadVideoBeforePlayback(
          trackId,
          abortController.signal,
          (percent) => {
            if (!active) return;
            setDeviceDownloadPercent(Math.max(0, Math.min(100, Number(percent) || 0)));
          }
        );
        if (!active) {
          console.log("⏹️ [PLAYER] Отмена эффекта после downloadVideoBeforePlayback:", trackId);
          detachAndRevokeBlob(downloadResult.src);
          return;
        }
        activeBlobUrlRef.current = downloadResult.src;
        setDeviceDownloadPercent(100);
        console.log("✅ [PLAYER] Видео готово с устройства (ждём готовность чата перед стартом):", {
          trackId,
          src: downloadResult.src,
          fromCache: downloadResult.fromCache,
        });
        setResolvedVideoSrc(downloadResult.src);
        setIsReadingFromDevice(false);
      } catch (err: any) {
        if (err?.name === "AbortError" || !active) return;
        console.error("🔥 [PLAYER] Ошибка при скачивании/чтении видео на устройство:", { trackId, err });
        if (!active) return;
        setIsReadingFromDevice(false);
        setIsBuffering(false);
        setResolvedVideoSrc("");
        setStreamError(true);
      }
    })();

    return () => {
      active = false;
      abortController.abort();
    };
  }, [trackId, hasVideo, retryTrigger, detachAndRevokeBlob]);

  useEffect(() => {
    return () => {
      const currentUrl = activeBlobUrlRef.current;
      activeBlobUrlRef.current = null;
      detachAndRevokeBlob(currentUrl);
    };
  }, [detachAndRevokeBlob]);

  useEffect(() => {
    syncAudioState();
  }, [syncAudioState]);

  useEffect(() => {
    const media = mediaRef.current;
    if (!media || !currentTrack) return;
    if (hasVideo && (!resolvedVideoSrc || !chatReady || streamError)) {
      if (!media.paused) media.pause();
      return;
    }
    if (isPlaying && !streamError) {
      const startPlay = () => {
        syncAudioState();
        console.log("▶️ [PLAYER] Чат загружен, декодер подготовил запас кадров — запуск media.play():", {
          trackId,
          src: resolvedVideoSrc,
          readyState: media.readyState,
        });
        media.play().catch((err) => {
          if (err.name !== "AbortError") console.error("🔥 [PLAYER] Ошибка play():", err.name, err.message);
        });
      };
      if (media.readyState >= 3) {
        startPlay();
      } else {
        media.addEventListener("canplay", startPlay, { once: true });
        return () => media.removeEventListener("canplay", startPlay);
      }
    } else if (!media.paused) {
      media.pause();
    }
  }, [isPlaying, trackId, hasVideo, streamError, retryTrigger, resolvedVideoSrc, chatReady, syncAudioState]);

  const handleWaiting = useCallback(() => {
    setIsBuffering(true);
  }, []);

  const handlePlaying = useCallback(() => {
    setIsBuffering(false);
  }, []);

  const handleCanPlay = useCallback(() => {
    setIsBuffering(false);
    const el = mediaRef.current;
    if (el && Number.isFinite(el.duration) && el.duration > 0) {
      setDuration((prev) => (Math.abs(prev - el.duration) > 0.25 ? el.duration : prev));
    }
  }, []);

  const handleVideoError = useCallback(() => {
    const videoEl = mediaRef.current as HTMLVideoElement | null;
    console.error("🔥 [PLAYER] Ошибка воспроизведения <video>:", {
      trackId,
      src: videoEl?.currentSrc || resolvedVideoSrc,
      errorCode: videoEl?.error?.code,
      errorMessage: videoEl?.error?.message,
    });
    setIsBuffering(false);
    setIsReadingFromDevice(false);
    setResolvedVideoSrc("");
    setStreamError(true);
  }, [trackId, resolvedVideoSrc]);

  if (!currentTrack || (!isAuthenticated && pathname === "/")) return null;

  const mediaSrc = hasVideo ? (streamError ? "" : resolvedVideoSrc) : (trackId ? `/api/tracks/stream/${trackId}` : currentTrack.audioUrl);

  const formatTime = (time: number) => {
    if (isNaN(time) || time === 0) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
  };

  const handleTimeUpdate = () => {
    if (!mediaRef.current) return;
    const now = performance.now();
    if (now - lastTimeUpdateRef.current < 400) return;
    lastTimeUpdateRef.current = now;
    setCurrentTime(mediaRef.current.currentTime);
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!mediaRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const newTime = ((e.clientX - rect.left) / rect.width) * duration;
    mediaRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleVolumeClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const nextVol = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setVolume(nextVol);
    if (isMuted && nextVol > 0) setIsMuted(false);
  };

  const progressPercent = duration ? (currentTime / duration) * 100 : 0;
  const volumePercent = isMuted ? 0 : volume * 100;
  const showVideoSurface = hasVideo && !streamError && Boolean(resolvedVideoSrc);
  const waitingForChat = hasVideo && !streamError && showVideoSurface && !chatReady;
  const formattedDownloadPercent = formatDownloadPercent(deviceDownloadPercent);

  return (
    <>
      {showAudioChatModal && !hasVideo && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-4 animate-fadeIn">
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl w-full max-w-lg h-[80vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800 bg-neutral-950">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500"><Music size={18} /></div>
                <div>
                  <h4 className="font-bold text-sm text-white">{currentTrack.title}</h4>
                  <p className="text-xs text-neutral-400">{currentTrack.singer}</p>
                </div>
              </div>
              <button onClick={() => setShowAudioChatModal(false)} aria-label={tr("Ёпиш", "Yopish", "Закрыть", "Close")} className="p-2 rounded-xl bg-neutral-800 hover:bg-red-500/20 text-neutral-400 hover:text-red-400 transition cursor-pointer border-none"><X size={18} /></button>
            </div>
            <div className="flex-1 p-3"><MemoDiscussion targetId={trackId} /></div>
          </div>
        </div>
      )}

      {hasVideo ? (
        <div className={isMinimizedVideo ? "fixed bottom-6 right-6 z-50 w-80 bg-neutral-900 border border-neutral-700 rounded-2xl overflow-hidden shadow-[0_10px_30px_rgba(0,0,0,0.8)]" : "fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-2 sm:p-6"}>
          <div className={isMinimizedVideo ? "flex flex-col w-full bg-neutral-900" : "relative w-full max-w-6xl h-[90vh] bg-neutral-900 border border-neutral-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col lg:flex-row"}>
            <div className={isMinimizedVideo ? "flex flex-col w-full" : "flex-1 flex flex-col h-full bg-black/50 border-r border-neutral-800"}>
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-neutral-800 bg-neutral-950">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 overflow-hidden shrink-0">
                    {currentTrack?.cover ? <img src={currentTrack.cover} alt={currentTrack.title} className="w-full h-full object-cover" /> : <Film size={18} />}
                  </div>
                  <div className="truncate">
                    <h3 className="font-bold text-xs sm:text-sm text-white truncate">{currentTrack.title}</h3>
                    <p className="text-[11px] sm:text-xs text-neutral-400 truncate">{currentTrack.singer}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {!isMinimizedVideo && (
                    <button onClick={() => setIsMinimizedVideo(true)} aria-label={tr("Кичрайтириш", "Kichraytirish", "Свернуть", "Minimize")} className="p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition cursor-pointer border-none flex items-center gap-1 text-xs font-medium"><Minimize2 size={16} /></button>
                  )}
                  <button onClick={closePlayer} aria-label={tr("Ёпиш", "Yopish", "Закрыть", "Close")} className="p-2 rounded-xl bg-neutral-800 hover:bg-red-500/20 text-neutral-400 hover:text-red-400 transition cursor-pointer border-none"><X size={isMinimizedVideo ? 14 : 18} /></button>
                </div>
              </div>

              <div className={isMinimizedVideo ? "relative aspect-video bg-black flex items-center justify-center overflow-hidden cursor-pointer" : "relative flex-1 bg-black flex items-center justify-center overflow-hidden"} onClick={() => { if (isMinimizedVideo && !streamError) setIsMinimizedVideo(false); }}>
                {streamError && (
                  <div className="flex flex-col items-center justify-center gap-3 p-4 text-center z-20">
                    <span className="text-xs sm:text-sm font-semibold text-red-400">{tr("Видеони ўқишда хатолик юз берди", "Videoni o'qishda xatolik yuz berdi", "Ошибка чтения видео", "Error reading video")}</span>
                    <button onClick={(e) => { e.stopPropagation(); setRetryTrigger((n) => n + 1); }} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-neutral-950 text-xs font-bold transition cursor-pointer border-none">
                      <RotateCcw size={14} />
                      <span>{tr("Қайта уриниш", "Qayta urinish", "Повторить", "Retry")}</span>
                    </button>
                  </div>
                )}

                <video
                  ref={mediaRef as React.RefObject<HTMLVideoElement>}
                  src={showVideoSurface && mediaSrc ? mediaSrc : undefined}
                  poster={currentTrack?.cover || undefined}
                  preload="auto"
                  playsInline
                  controlsList="nodownload"
                  onClick={() => { if (!isMinimizedVideo && showVideoSurface && chatReady) togglePlay(); }}
                  onContextMenu={(e) => e.preventDefault()}
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={() => {
                    syncAudioState();
                    if (mediaRef.current && Number.isFinite(mediaRef.current.duration)) {
                      setDuration(mediaRef.current.duration || 0);
                    }
                  }}
                  onCanPlay={handleCanPlay}
                  onWaiting={handleWaiting}
                  onPlaying={handlePlaying}
                  onError={handleVideoError}
                  onEnded={() => nextTrack()}
                  className={showVideoSurface ? (isMinimizedVideo ? "w-full h-full object-cover" : "w-full h-full object-contain cursor-pointer") : "hidden"}
                />

                {isReadingFromDevice && !streamError && (
                  <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center gap-3 p-4 text-center z-10 pointer-events-none">
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-xs sm:text-sm font-medium text-emerald-300 flex items-center gap-1.5">
                        <HardDrive size={15} className="text-emerald-400 shrink-0" />
                        <span>{tr("Кўрсатиш учун қурилмага юкланмоқда...", "Ko'rsatish uchun qurilmaga yuklanmoqda...", "Идёт загрузка для показа...", "Downloading for playback...")}</span>
                      </span>
                      <span className="text-sm sm:text-base font-bold text-emerald-400 tabular-nums">{formattedDownloadPercent}</span>
                    </div>
                    <div className="w-56 sm:w-64 h-2 bg-neutral-800 rounded-full overflow-hidden border border-neutral-700/70">
                      <div className="h-full bg-emerald-400" style={{ width: `${deviceDownloadPercent}%` }} />
                    </div>
                  </div>
                )}

                {isBuffering && !streamError && showVideoSurface && chatReady && !isReadingFromDevice && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center pointer-events-none z-10">
                    <span className="text-xs text-emerald-300 font-medium">{tr("Буферизация...", "Buferizatsiya...", "Буферизация...", "Buffering...")}</span>
                  </div>
                )}

                {waitingForChat && !isReadingFromDevice && (
                  <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center gap-2.5 p-4 text-center z-10 pointer-events-none">
                    <span className="text-xs sm:text-sm font-medium text-emerald-300">
                      {tr("Сабр қилинг, Видео клип юкланмоқда...", "Sabr qiling, Video yuklanmoqda...", "Загрузка чата, видео запустится после формирования чата...", "Loading chat, video will start after chat is ready...")}
                    </span>
                  </div>
                )}
              </div>

              {isMinimizedVideo ? (
                <div className="p-3 bg-neutral-900 flex items-center justify-between border-t border-neutral-800">
                  <div className="truncate pr-2">
                    <h4 className="font-semibold text-xs text-white truncate">{currentTrack.title}</h4>
                    <p className="text-[10px] text-neutral-400 truncate">{currentTrack.singer}</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button onClick={togglePlay} disabled={!showVideoSurface || !chatReady} aria-label={isPlaying ? tr("Пауза", "Pauza", "Пауза", "Pause") : tr("Ижро этиш", "Ijro etish", "Воспроизвести", "Play")} className="p-1.5 rounded-full bg-emerald-500 text-neutral-950 hover:bg-emerald-400 transition cursor-pointer border-none disabled:opacity-50">
                      {isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                    </button>
                    <button onClick={closePlayer} aria-label={tr("Ёпиш", "Yopish", "Закрыть", "Close")} className="p-1.5 rounded-lg bg-neutral-800 text-neutral-400 hover:text-red-400 transition cursor-pointer border-none"><X size={14} /></button>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-neutral-950 border-t border-neutral-800 flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-neutral-400 w-10 text-right">{formatTime(currentTime)}</span>
                    <div onClick={handleProgressClick} className="w-full h-2 bg-neutral-800 rounded-full overflow-hidden relative cursor-pointer">
                      <div className="absolute top-0 left-0 bottom-0 bg-emerald-500" style={{ width: `${progressPercent}%` }} />
                    </div>
                    <span className="text-xs text-neutral-400 w-10">{formatTime(duration)}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <button onClick={prevTrack} aria-label={tr("Олдинги", "Oldingi", "Предыдущий", "Previous")} className="text-neutral-400 hover:text-white transition cursor-pointer bg-transparent border-none"><SkipBack size={20} /></button>
                      <button onClick={togglePlay} disabled={!showVideoSurface || !chatReady} aria-label={isPlaying ? tr("Пауза", "Pauza", "Пауза", "Pause") : tr("Ижро этиш", "Ijro etish", "Воспроизвести", "Play")} className="p-2.5 rounded-full bg-emerald-500 hover:bg-emerald-600 text-neutral-950 cursor-pointer transition border-none shadow-[0_0_15px_rgba(16,185,129,0.3)] disabled:opacity-50">
                        {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
                      </button>
                      <button onClick={nextTrack} aria-label={tr("Кейинги", "Keyingi", "Следующий", "Next")} className="text-neutral-400 hover:text-white transition cursor-pointer bg-transparent border-none"><SkipForward size={20} /></button>
                    </div>

                    <div className="flex items-center gap-3">
                      <button onClick={() => setIsMuted(!isMuted)} aria-label={isMuted || volume === 0 ? tr("Овозни ёқиш", "Ovozni yoqish", "Включить звук", "Unmute") : tr("Овозни ўчириш", "Ovozni o'chirish", "Выключить звук", "Mute")} className="text-neutral-400 hover:text-white transition cursor-pointer bg-transparent border-none">
                        {isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
                      </button>
                      <div onClick={handleVolumeClick} className="w-20 h-2 bg-neutral-800 rounded-full overflow-hidden relative cursor-pointer">
                        <div className="absolute top-0 left-0 bottom-0 bg-emerald-500" style={{ width: `${volumePercent}%` }} />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {!isMinimizedVideo && (
              <div className="w-full lg:w-96 flex flex-col h-72 lg:h-full p-3 bg-neutral-950">
                <MemoDiscussion targetId={trackId} targetType="video" onReady={handleChatReady} />
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="fixed bottom-0 left-0 right-0 bg-neutral-900 border-t border-neutral-800 text-white z-50 shadow-2xl p-4">
          {mediaSrc && (
            <audio
              ref={mediaRef as React.RefObject<HTMLAudioElement>}
              src={mediaSrc}
              preload="metadata"
              controlsList="nodownload"
              onLoadedMetadata={() => {
                syncAudioState();
                if (mediaRef.current) setDuration(mediaRef.current.duration || 0);
              }}
              onCanPlay={syncAudioState}
              onTimeUpdate={handleTimeUpdate}
              onEnded={() => nextTrack()}
            />
          )}

          <div className="max-w-7xl mx-auto flex items-center justify-between gap-6 w-full">
            <div className="flex items-center gap-3 min-w-[200px]">
              <div className="w-12 h-12 rounded-lg bg-neutral-800 flex-shrink-0 flex items-center justify-center overflow-hidden border border-neutral-800">
                {currentTrack?.cover ? <img src={currentTrack.cover} alt={currentTrack.title} className="w-full h-full object-cover" /> : <span className="text-xs text-neutral-500">🎵</span>}
              </div>
              <div className="truncate">
                <h4 className="font-semibold text-sm truncate">{currentTrack.title}</h4>
                <p className="text-xs text-neutral-400 truncate">{currentTrack.singer}</p>
              </div>
            </div>

            <div className="flex items-center gap-4 flex-1 max-w-2xl">
              <button onClick={prevTrack} aria-label={tr("Олдинги", "Oldingi", "Предыдущий", "Previous")} className="text-neutral-400 hover:text-white transition cursor-pointer bg-transparent border-none p-0"><SkipBack size={20} /></button>
              <button onClick={togglePlay} aria-label={isPlaying ? tr("Пауза", "Pauza", "Пауза", "Pause") : tr("Ижро этиш", "Ijro etish", "Воспроизвести", "Play")} className="p-2.5 rounded-full bg-amber-500 hover:bg-amber-600 text-neutral-950 cursor-pointer transition flex-shrink-0 border-none">
                {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
              </button>
              <button onClick={nextTrack} aria-label={tr("Кейинги", "Keyingi", "Следующий", "Next")} className="text-neutral-400 hover:text-white transition cursor-pointer bg-transparent border-none p-0"><SkipForward size={20} /></button>

              <span className="text-xs text-neutral-400 w-10 text-right">{formatTime(currentTime)}</span>
              <div onClick={handleProgressClick} className="w-full h-2 bg-neutral-700 rounded-full overflow-hidden relative cursor-pointer">
                <div className="absolute top-0 left-0 bottom-0 bg-amber-500" style={{ width: `${progressPercent}%` }} />
              </div>
              <span className="text-xs text-neutral-400 w-10">{formatTime(duration)}</span>
            </div>

            <div className="flex items-center gap-3 min-w-[160px] justify-end">
              <button onClick={() => setShowAudioChatModal(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition cursor-pointer border-none text-xs font-medium">
                <MessageSquare size={16} className="text-amber-500" />
                <span>{tr("Муҳокама", "Muhokama", "Чат", "Chat")}</span>
              </button>

              <button onClick={() => setIsMuted(!isMuted)} aria-label={isMuted || volume === 0 ? tr("Овозни ёқиш", "Ovozni yoqish", "Включить звук", "Unmute") : tr("Овозни ўчириш", "Ovozni o'chirish", "Выключить звук", "Mute")} className="text-neutral-400 hover:text-white transition cursor-pointer bg-transparent border-none p-0">
                {isMuted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
              </button>

              <div onClick={handleVolumeClick} className="w-16 sm:w-20 h-2 bg-neutral-700 rounded-full overflow-hidden relative cursor-pointer">
                <div className="absolute top-0 left-0 bottom-0 bg-amber-500" style={{ width: `${volumePercent}%` }} />
              </div>

              <button onClick={closePlayer} aria-label={tr("Ёпиш", "Yopish", "Закрыть", "Close")} className="p-2 rounded-xl bg-neutral-800 hover:bg-red-500/20 text-neutral-400 hover:text-red-400 transition cursor-pointer ml-1 border-none"><X size={18} /></button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}