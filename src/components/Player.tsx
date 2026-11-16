"use client";

// БЛОК - "Player" src\components\Player.tsx
import { usePlayer } from "@/context/PlayerContext";
import { Play, Pause, Volume2, VolumeX, X, SkipBack, SkipForward, Minimize2, Film, MessageSquare, Music } from "lucide-react";
import { useRef, useEffect, useState } from "react";
import { tr } from "@/utils/translate";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Discussion from "@/components/Discussion";

export default function Player() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, status } = useSession();
  const { currentTrack, isPlaying, togglePlay, closePlayer, nextTrack, prevTrack } = usePlayer();
  
  const mediaRef = useRef<HTMLAudioElement | HTMLVideoElement | null>(null);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isMinimizedVideo, setIsMinimizedVideo] = useState(false);
  const [showAudioChatModal, setShowAudioChatModal] = useState(false);

  // 🚀 Состояния для клиентского кеширования на диск юзера через Cache API (надежная альтернатива OPFS)
  const [localVideoSrc, setLocalVideoSrc] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);

  const isAuthenticated = status === "authenticated" && Boolean(session?.user);

  useEffect(() => {
    if (!currentTrack?.id && !currentTrack?._id) return;
    setIsMinimizedVideo(false);
    setLocalVideoSrc(null);
    setDownloadProgress(0);
  }, [currentTrack]);

  // 🚀 Функция скачивания и кеширования видео на локальный диск юзера через Cache API
  useEffect(() => {
    let isCancelled = false;
    
    async function loadVideoToLocalStorage() {
      const hasVideo = Boolean(currentTrack?.videoUrl || (currentTrack as any)?.videoFileId);
      if (!hasVideo || !currentTrack) return;

      const videoFileId = (currentTrack as any)?.videoFileId || currentTrack?.id || currentTrack?._id;
      const fileSourceUrl = (currentTrack as any)?.videoFileId ? `/api/videos/stream/${videoFileId}` : currentTrack?.videoUrl;

      if (!fileSourceUrl) return;

      try {
        const cacheName = "uzbekistonovozi-video-cache-v1";
        const cache = await caches.open(cacheName);
        const cacheKey = new Request(fileSourceUrl);

        // Проверяем, есть ли файл в локальном кеше браузера (на диске юзера)
        const cachedResponse = await cache.match(cacheKey);

        if (cachedResponse) {
          console.log("🟢 Видео найдено в локальном кеше браузера юзера!");
          const blob = await cachedResponse.blob();
          const localUrl = URL.createObjectURL(blob);
          if (!isCancelled) {
            setLocalVideoSrc(localUrl);
            setIsDownloading(false);
          }
          return;
        }

        // Если файла нет в кеше — скачиваем в фоновом режиме на диск юзера
        if (!isCancelled) setIsDownloading(true);
        console.log("📥 Скачивание видео на диск юзера...");

        const response = await fetch(fileSourceUrl);
        if (!response.ok || !response.body) throw new Error("Ошибка загрузки видеопотока");

        // Кладываем ответ сразу в браузерный Cache API (на диск)
        await cache.put(cacheKey, response.clone());

        // Достаем свежий блоб для воспроизведения
        const freshResponse = await cache.match(cacheKey);
        if (freshResponse) {
          const blob = await freshResponse.blob();
          const localUrl = URL.createObjectURL(blob);
          if (!isCancelled) {
            setLocalVideoSrc(localUrl);
            setIsDownloading(false);
            setDownloadProgress(100);
          }
        }
      } catch (err) {
        console.error("⚠️ Ошибка клиентского кеширования, используем прямую ссылку:", err);
        if (!isCancelled) {
          setLocalVideoSrc(fileSourceUrl);
          setIsDownloading(false);
        }
      }
    }

    loadVideoToLocalStorage();

    return () => {
      isCancelled = true;
    };
  }, [currentTrack]);

  const handleMediaError = () => {
    console.warn("⚠️ Ошибка загрузки медиафайла. Закрываем плеер...");
    closePlayer();
  };

  useEffect(() => {
    const media = mediaRef.current;
    if (!media || !currentTrack) return;

    if (isPlaying && !isDownloading && localVideoSrc) {
      media.play().catch((err) => {
        console.error("🔥 Ошибка воспроизведения:", err.message);
        handleMediaError();
      });
    } else {
      media.pause();
    }
  }, [isPlaying, currentTrack, isDownloading, localVideoSrc]);

  useEffect(() => {
    if (mediaRef.current) {
      mediaRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  if (!currentTrack || (!isAuthenticated && pathname === "/")) {
    return null;
  }

  const hasVideo = Boolean(currentTrack?.videoUrl || (currentTrack as any)?.videoFileId);
  const trackId = currentTrack.id || currentTrack._id;
  
  const mediaSrc = hasVideo
    ? (localVideoSrc || "")
    : (trackId ? `/api/tracks/stream/${trackId}` : currentTrack.audioUrl);

  const formatTime = (time: number) => {
    if (isNaN(time) || time === 0) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
  };

  const handleTimeUpdate = () => {
    if (!mediaRef.current) return;
    setCurrentTime(mediaRef.current.currentTime);
  };

  const handleLoadedMetadata = () => {
    if (mediaRef.current) {
      setDuration(mediaRef.current.duration);
    }
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!mediaRef.current || !duration) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const newTime = (clickX / rect.width) * duration;
      
    mediaRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleVolumeClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const newVolume = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setVolume(newVolume);
    if (isMuted) setIsMuted(false);
  };

  const progressPercent = duration ? (currentTime / duration) * 100 : 0;
  const volumePercent = isMuted ? 0 : volume * 100;

  return (
    <>
      {showAudioChatModal && !hasVideo && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl w-full max-w-lg h-[80vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800 bg-neutral-950">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500">
                  <Music size={18} />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-white">{currentTrack.title}</h4>
                  <p className="text-xs text-neutral-400">{currentTrack.singer}</p>
                </div>
              </div>
              <button onClick={() => setShowAudioChatModal(false)} className="p-2 rounded-xl bg-neutral-800 hover:bg-red-500/20 text-neutral-400 hover:text-red-400 transition cursor-pointer border-none">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 p-3">
              <Discussion targetId={trackId} />
            </div>
          </div>
        </div>
      )}

      {hasVideo ? (
        isMinimizedVideo ? (
          <div className="fixed bottom-6 right-6 z-50 w-80 bg-neutral-900 border border-neutral-700 rounded-2xl overflow-hidden shadow-[0_10px_30px_rgba(0,0,0,0.8)] animate-fadeIn">
            <div className="relative aspect-video bg-black flex items-center justify-center group cursor-pointer" onClick={() => !isDownloading && setIsMinimizedVideo(false)}>
              {isDownloading ? (
                <div className="flex flex-col items-center justify-center gap-2 p-4 text-center">
                  <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-[10px] text-emerald-400 font-medium">Загрузка на диск юзера...</span>
                </div>
              ) : (
                <video 
                  ref={mediaRef as React.RefObject<HTMLVideoElement>} 
                  src={mediaSrc} 
                  preload="metadata" 
                  onTimeUpdate={handleTimeUpdate} 
                  onLoadedMetadata={handleLoadedMetadata} 
                  onEnded={() => nextTrack()} 
                  onError={handleMediaError} 
                  className="w-full h-full object-cover" 
                />
              )}
            </div>
            <div className="p-3 bg-neutral-900 flex items-center justify-between">
              <div className="truncate pr-2">
                <h4 className="font-semibold text-xs text-white truncate">{currentTrack.title}</h4>
                <p className="text-[10px] text-neutral-400 truncate">{currentTrack.singer}</p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button onClick={togglePlay} disabled={isDownloading} className="p-1.5 rounded-full bg-emerald-500 text-neutral-950 hover:bg-emerald-400 transition cursor-pointer border-none disabled:opacity-50">
                  {isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                </button>
                <button onClick={closePlayer} className="p-1.5 rounded-lg bg-neutral-800 text-neutral-400 hover:text-red-400 transition cursor-pointer border-none">
                  <X size={14} />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-md p-2 sm:p-6 animate-fadeIn">
            <div className="relative w-full max-w-6xl h-[90vh] bg-neutral-900 border border-neutral-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col lg:flex-row">
              <div className="flex-1 flex flex-col h-full bg-black/50 border-r border-neutral-800">
                <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-800 bg-neutral-950">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                      <Film size={18} />
                    </div>
                    <div className="truncate">
                      <h3 className="font-bold text-sm text-white truncate">{currentTrack.title}</h3>
                      <p className="text-xs text-neutral-400 truncate">{currentTrack.singer}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button onClick={() => setIsMinimizedVideo(true)} className="p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition cursor-pointer border-none flex items-center gap-1 text-xs font-medium">
                      <Minimize2 size={16} />
                    </button>
                    <button onClick={closePlayer} className="p-2 rounded-xl bg-neutral-800 hover:bg-red-500/20 text-neutral-400 hover:text-red-400 transition cursor-pointer border-none">
                      <X size={18} />
                    </button>
                  </div>
                </div>

                <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden">
                  {isDownloading ? (
                    <div className="flex flex-col items-center justify-center gap-4 p-6 text-center">
                      <div className="w-14 h-14 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-semibold text-white">Скачивание видео на устройство юзера...</span>
                      </div>
                    </div>
                  ) : (
                    <video 
                      ref={mediaRef as React.RefObject<HTMLVideoElement>} 
                      src={mediaSrc} 
                      preload="metadata" 
                      controls
                      onTimeUpdate={handleTimeUpdate} 
                      onLoadedMetadata={handleLoadedMetadata} 
                      onEnded={() => nextTrack()} 
                      onError={handleMediaError} 
                      className="w-full h-full object-contain" 
                    />
                  )}
                </div>

                <div className="p-4 bg-neutral-950 border-t border-neutral-800 flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-neutral-400 w-10 text-right">{formatTime(currentTime)}</span>
                    <div onClick={handleProgressClick} className="w-full h-2 bg-neutral-800 rounded-full overflow-hidden relative cursor-pointer">
                      <div className="absolute top-0 left-0 bottom-0 bg-emerald-500 transition-all duration-75" style={{ width: `${progressPercent}%` }} />
                    </div>
                    <span className="text-xs text-neutral-400 w-10">{formatTime(duration)}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <button onClick={prevTrack} className="text-neutral-400 hover:text-white transition cursor-pointer bg-transparent border-none">
                        <SkipBack size={20} />
                      </button>
                      <button onClick={togglePlay} disabled={isDownloading} className="p-2.5 rounded-full bg-emerald-500 hover:bg-emerald-600 text-neutral-950 cursor-pointer transition border-none shadow-[0_0_15px_rgba(16,185,129,0.3)] disabled:opacity-50">
                        {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
                      </button>
                      <button onClick={nextTrack} className="text-neutral-400 hover:text-white transition cursor-pointer bg-transparent border-none">
                        <SkipForward size={20} />
                      </button>
                    </div>

                    <div className="flex items-center gap-3">
                      <button onClick={() => setIsMuted(!isMuted)} className="text-neutral-400 hover:text-white transition cursor-pointer bg-transparent border-none">
                        {isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
                      </button>
                      <div onClick={handleVolumeClick} className="w-20 h-2 bg-neutral-800 rounded-full overflow-hidden relative cursor-pointer">
                        <div className="absolute top-0 left-0 bottom-0 bg-emerald-500" style={{ width: `${volumePercent}%` }} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="w-full lg:w-96 flex flex-col h-72 lg:h-full p-3 bg-neutral-950">
                <Discussion targetId={trackId} />
              </div>
            </div>
          </div>
        )
      ) : (
        /* АУДИОПЛЕЕР (НИЖНЯЯ ПАНЕЛЬ) */
        <div className="fixed bottom-0 left-0 right-0 bg-neutral-900 border-t border-neutral-800 text-white z-50 shadow-2xl p-4">
          <audio ref={mediaRef as React.RefObject<HTMLAudioElement>} src={mediaSrc} preload="metadata" onTimeUpdate={handleTimeUpdate} onLoadedMetadata={handleLoadedMetadata} onEnded={() => nextTrack()} onError={handleMediaError} />

          <div className="max-w-7xl mx-auto flex items-center justify-between gap-6 w-full">
            <div className="flex items-center gap-3 min-w-[200px]">
              <div className="w-12 h-12 rounded-lg bg-neutral-800 flex-shrink-0 flex items-center justify-center overflow-hidden border border-neutral-800">
                {currentTrack?.cover ? (
                  <img src={currentTrack.cover} alt={currentTrack.title} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xs text-neutral-500">🎵</span>
                )}
              </div>
              <div className="truncate">
                <h4 className="font-semibold text-sm truncate">{currentTrack.title}</h4>
                <p className="text-xs text-neutral-400 truncate">{currentTrack.singer}</p>
              </div>
            </div>

            <div className="flex items-center gap-4 flex-1 max-w-2xl">
              <button onClick={prevTrack} className="text-neutral-400 hover:text-white transition cursor-pointer bg-transparent border-none p-0">
                <SkipBack size={20} />
              </button>
              <button onClick={togglePlay} className="p-2.5 rounded-full bg-amber-500 hover:bg-amber-600 text-neutral-950 cursor-pointer transition flex-shrink-0 border-none">
                {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
              </button>
              <button onClick={nextTrack} className="text-neutral-400 hover:text-white transition cursor-pointer bg-transparent border-none p-0">
                <SkipForward size={20} />
              </button>

              <span className="text-xs text-neutral-400 w-10 text-right">{formatTime(currentTime)}</span>
              <div onClick={handleProgressClick} className="w-full h-2 bg-neutral-700 rounded-full overflow-hidden relative cursor-pointer">
                <div className="absolute top-0 left-0 bottom-0 bg-amber-500 transition-all duration-75" style={{ width: `${progressPercent}%` }} />
              </div>
              <span className="text-xs text-neutral-400 w-10">{formatTime(duration)}</span>
            </div>

            <div className="flex items-center gap-3 min-w-[160px] justify-end">
              <button onClick={() => setShowAudioChatModal(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition cursor-pointer border-none text-xs font-medium">
                <MessageSquare size={16} className="text-amber-500" />
                <span>{tr("Муҳокама", "Muhokama", "Чат", "Chat")}</span>
              </button>

              <button onClick={() => setIsMuted(!isMuted)} className="text-neutral-400 hover:text-white transition cursor-pointer bg-transparent border-none p-0">
                {isMuted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
              </button>
              
              <div onClick={handleVolumeClick} className="w-16 sm:w-20 h-2 bg-neutral-700 rounded-full overflow-hidden relative cursor-pointer">
                <div className="absolute top-0 left-0 bottom-0 bg-amber-500" style={{ width: `${volumePercent}%` }} />
              </div>

              <button onClick={closePlayer} className="p-2 rounded-xl bg-neutral-800 hover:bg-red-500/20 text-neutral-400 hover:text-red-400 transition cursor-pointer ml-1 border-none">
                <X size={18} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}