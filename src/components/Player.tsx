"use client";
//src\components\Player.tsx
import { usePlayer } from "@/context/PlayerContext";
import { Play, Pause, Volume2, VolumeX, X, SkipBack, SkipForward, Minimize2, Film, MessageSquare, Music, RotateCcw, HardDrive } from "lucide-react";
import { useRef, useEffect, useState, useCallback, memo } from "react";
import { tr } from "@/utils/translate";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import Discussion from "@/components/Discussion";
import { loadVideoToDevice, revokeLocalVideoUrl } from "@/utils/videoDeviceCache";

const MemoDiscussion = memo(Discussion);

export default function Player() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const { currentTrack, isPlaying, togglePlay, closePlayer, nextTrack, prevTrack } = usePlayer();

  const mediaRef = useRef<HTMLAudioElement | HTMLVideoElement | null>(null);
  const lastTimeUpdateRef = useRef<number>(0);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isMinimizedVideo, setIsMinimizedVideo] = useState(false);
  const [showAudioChatModal, setShowAudioChatModal] = useState(false);
  const [streamError, setStreamError] = useState<boolean>(false);
  const [retryTrigger, setRetryTrigger] = useState<number>(0);
  const [isBuffering, setIsBuffering] = useState<boolean>(false);
  const [loadPercent, setLoadPercent] = useState<number>(0);
  const [chatReady, setChatReady] = useState<boolean>(false);
  const [resolvedVideoSrc, setResolvedVideoSrc] = useState<string>("");

  const isAuthenticated = status === "authenticated" && Boolean(session?.user);
  const trackId = String(currentTrack?._id || currentTrack?.id || "").trim();
  const hasVideo = Boolean(currentTrack?.videoUrl || (currentTrack as any)?.telegramUrl || (currentTrack as any)?.videoFileId);

  const handleChatReady = useCallback(() => {
    setChatReady(true);
  }, []);

  const updateBufferedPercent = useCallback(() => {
    const media = mediaRef.current;
    if (!media) return;
    if (resolvedVideoSrc.startsWith("blob:")) {
      setLoadPercent(100);
      return;
    }
    const dur = media.duration;
    if (!dur || !isFinite(dur) || dur <= 0 || media.buffered.length === 0) return;
    const bufferedEnd = media.buffered.end(media.buffered.length - 1);
    const pct = Math.max(0, Math.min(100, Math.round((bufferedEnd / dur) * 100)));
    setLoadPercent(pct);
  }, [resolvedVideoSrc]);

  useEffect(() => {
    let active = true;
    let createdBlobUrl: string | null = null;
    const abortController = new AbortController();

    setIsMinimizedVideo(false);
    setStreamError(false);
    setCurrentTime(0);
    setDuration(0);
    setLoadPercent(0);
    setIsBuffering(Boolean(trackId && hasVideo));
    setChatReady(!hasVideo || !trackId);
    setResolvedVideoSrc("");

    if (!hasVideo || !trackId) {
      return () => {
        active = false;
        abortController.abort();
      };
    }

    (async () => {
      try {
        const localBlobUrl = await loadVideoToDevice(trackId, abortController.signal, (pct) => {
          if (active) setLoadPercent(Math.max(0, Math.min(100, Math.round(pct))));
        });
        if (!active) {
          revokeLocalVideoUrl(localBlobUrl);
          return;
        }
        createdBlobUrl = localBlobUrl;
        setLoadPercent(100);
        setResolvedVideoSrc(localBlobUrl);
        setIsBuffering(false);
      } catch (err: any) {
        if (!active || err?.name === "AbortError") return;
        setIsBuffering(false);
        setStreamError(true);
      }
    })();

    return () => {
      active = false;
      abortController.abort();
      revokeLocalVideoUrl(createdBlobUrl);
    };
  }, [trackId, hasVideo, retryTrigger]);

  useEffect(() => {
    const media = mediaRef.current;
    if (!media || !currentTrack) return;
    if (hasVideo && (!resolvedVideoSrc.startsWith("blob:") || !chatReady)) {
      media.pause();
      return;
    }
    if (isPlaying && !streamError) {
      const startPlay = () => {
        media.play().catch((err) => { if (err.name !== "AbortError") console.error("🔥 Ошибка play():", err.message); });
      };
      if (media.readyState >= 2) {
        startPlay();
      } else {
        media.addEventListener("canplay", startPlay, { once: true });
        return () => media.removeEventListener("canplay", startPlay);
      }
    } else {
      media.pause();
    }
  }, [isPlaying, trackId, hasVideo, streamError, retryTrigger, resolvedVideoSrc, chatReady]);

  useEffect(() => {
    if (mediaRef.current) mediaRef.current.volume = isMuted ? 0 : volume;
  }, [volume, isMuted]);

  const handleWaiting = useCallback(() => {
    if (!resolvedVideoSrc.startsWith("blob:")) setIsBuffering(true);
  }, [resolvedVideoSrc]);
  const handlePlaying = useCallback(() => {
    setIsBuffering(false);
  }, []);
  const handleCanPlay = useCallback(() => {
    setIsBuffering(false);
    if (mediaRef.current) {
      setDuration(mediaRef.current.duration || 0);
      updateBufferedPercent();
    }
  }, [updateBufferedPercent]);
  const handleVideoError = useCallback(() => { setIsBuffering(false); setStreamError(true); }, []);

  if (!currentTrack || (!isAuthenticated && pathname === "/")) return null;

  const mediaSrc = hasVideo ? resolvedVideoSrc : (trackId ? `/api/tracks/stream/${trackId}` : currentTrack.audioUrl);

  const formatTime = (time: number) => {
    if (isNaN(time) || time === 0) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
  };

  const handleTimeUpdate = () => {
    if (!mediaRef.current) return;
    const now = performance.now();
    if (now - lastTimeUpdateRef.current < 300) return;
    lastTimeUpdateRef.current = now;
    setCurrentTime(mediaRef.current.currentTime);
    updateBufferedPercent();
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
    setVolume(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
    if (isMuted) setIsMuted(false);
  };

  const progressPercent = duration ? (currentTime / duration) * 100 : 0;
  const volumePercent = isMuted ? 0 : volume * 100;
  const showVideoSurface = hasVideo && !streamError && resolvedVideoSrc.startsWith("blob:");
  const waitingForChat = hasVideo && !streamError && showVideoSurface && !chatReady;

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
                    <span className="text-xs sm:text-sm font-semibold text-red-400">{tr("Видеони қурилмага юклашда хатолик юз берди", "Videoni qurilmaga yuklashda xatolik yuz berdi", "Ошибка загрузки видео на устройство", "Error loading video to device")}</span>
                    <button onClick={(e) => { e.stopPropagation(); setRetryTrigger((n) => n + 1); }} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-neutral-950 text-xs font-bold transition cursor-pointer border-none">
                      <RotateCcw size={14} />
                      <span>{tr("Қайта уриниш", "Qayta urinish", "Повторить", "Retry")}</span>
                    </button>
                  </div>
                )}

                <video
                  ref={mediaRef as React.RefObject<HTMLVideoElement>}
                  src={showVideoSurface ? mediaSrc : undefined}
                  poster={currentTrack?.cover || undefined}
                  preload="auto"
                  playsInline
                  controlsList="nodownload"
                  onClick={() => { if (!isMinimizedVideo && showVideoSurface && chatReady) togglePlay(); }}
                  onContextMenu={(e) => e.preventDefault()}
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={() => {
                    if (mediaRef.current) setDuration(mediaRef.current.duration || 0);
                    updateBufferedPercent();
                  }}
                  onProgress={updateBufferedPercent}
                  onCanPlay={handleCanPlay}
                  onWaiting={handleWaiting}
                  onPlaying={handlePlaying}
                  onError={handleVideoError}
                  onEnded={() => nextTrack()}
                  className={showVideoSurface ? (isMinimizedVideo ? "w-full h-full object-cover" : "w-full h-full object-contain cursor-pointer") : "hidden"}
                />

                {!showVideoSurface && !streamError && (
                  <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-3 p-4 text-center z-10">
                    <div className="w-9 h-9 border-3 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs sm:text-sm font-medium text-emerald-300 flex items-center gap-1.5">
                      <HardDrive size={15} className="text-emerald-400 shrink-0" />
                      <span>{tr("Қурилмага юкланмоқда...", "Qurilmaga yuklanmoqda...", "Загрузка на устройство...", "Loading to device...")} {loadPercent}%</span>
                    </span>
                    <div className="w-56 sm:w-72 h-2 bg-neutral-800 rounded-full overflow-hidden border border-neutral-700">
                      <div className="h-full bg-emerald-400 transition-all duration-150" style={{ width: `${loadPercent}%` }} />
                    </div>
                  </div>
                )}

                {waitingForChat && (
                  <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center gap-2.5 p-4 text-center z-10 pointer-events-none">
                    <div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs sm:text-sm font-medium text-emerald-300">
                      {tr("Чат юкланмоқда, видео бироздан сўнг бошланади...", "Chat yuklanmoqda, video birozdan so'ng boshlanadi...", "Загрузка чата, видео запустится после формирования чата...", "Loading chat, video will start after chat is ready...")}
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
                      <div className="absolute top-0 left-0 bottom-0 bg-emerald-500 transition-all duration-100" style={{ width: `${progressPercent}%` }} />
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
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={() => mediaRef.current && setDuration(mediaRef.current.duration || 0)}
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
                <div className="absolute top-0 left-0 bottom-0 bg-amber-500 transition-all duration-100" style={{ width: `${progressPercent}%` }} />
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