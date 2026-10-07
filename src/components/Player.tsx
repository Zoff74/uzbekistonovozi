"use client";

// БЛОК - "Player" src\components\Player.tsx
import { usePlayer } from "@/context/PlayerContext";
import { Play, Pause, Volume2, VolumeX, X, SkipBack, SkipForward, Minimize2, Lock, Film, MessageSquare, Music } from "lucide-react";
import { useRef, useEffect, useState } from "react";
import { tr } from "@/utils/translate";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Discussion from "@/components/Discussion"; // <--- Используем универсальный компонент Discussion

export default function Player() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, status } = useSession();
  const { currentTrack, isPlaying, togglePlay, setIsPlaying, closePlayer, nextTrack, prevTrack } = usePlayer();
  
  const mediaRef = useRef<HTMLAudioElement | HTMLVideoElement | null>(null);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isMinimizedVideo, setIsMinimizedVideo] = useState(false);
  const [showDemoModal, setShowDemoModal] = useState(false);
  const [showAudioChatModal, setShowAudioChatModal] = useState(false);

  const isAuthenticated = status === "authenticated" && Boolean(session?.user);

  useEffect(() => {
    if (!currentTrack?.id) return;
    setIsMinimizedVideo(false);
  }, [currentTrack?.id]);

  const handleTogglePlaySecure = () => {
    if (!isAuthenticated) {
      if (mediaRef.current && mediaRef.current.currentTime >= 20) {
        mediaRef.current.currentTime = 0;
        setCurrentTime(0);
      }
    }
    togglePlay();
  };

  useEffect(() => {
    const media = mediaRef.current;
    if (!media || !currentTrack) return;

    if (isPlaying) {
      media.play().catch((err) => {
        console.error("Ошибка воспроизведения:", err);
        setIsPlaying(false);
      });
    } else {
      media.pause();
    }
  }, [isPlaying, currentTrack, setIsPlaying]);

  useEffect(() => {
    if (mediaRef.current) {
      mediaRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  // Скрываем плеер, если трек не выбран, 
  // ИЛИ если пользователь НЕ авторизован и находится на главной странице (лендинге)
  if (!currentTrack || (!isAuthenticated && pathname === "/")) {
    return null;
  }

  const hasVideo = Boolean(currentTrack?.videoUrl);
  const mediaSrc = currentTrack?.videoUrl || currentTrack?.audioUrl;

  const formatTime = (time: number) => {
    if (isNaN(time) || time === 0) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
  };

  const handleTimeUpdate = () => {
    if (!mediaRef.current) return;
    const current = mediaRef.current.currentTime;

    if (!isAuthenticated && current >= 20) {
      mediaRef.current.pause();
      mediaRef.current.currentTime = 0;
      setCurrentTime(0);
      setIsPlaying(false);
      setShowDemoModal(true);
      return;
    }

    setCurrentTime(current);
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
      
    if (!isAuthenticated && newTime > 20) {
      setShowDemoModal(true);
      return;
    }

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
      {showDemoModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-neutral-900 border border-[#39FF14]/40 rounded-2xl p-6 max-w-md w-full text-center shadow-[0_0_30px_rgba(57,255,20,0.2)] flex flex-col items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-[#39FF14]/10 border border-[#39FF14]/30 flex items-center justify-center text-[#39FF14]">
              <Lock size={28} />
            </div>
            <h3 className="text-xl font-bold text-white">
              {tr("Демо-режим тугади", "Demo-rejim tugadi", "Демо-режим окончен", "Demo ended")}
            </h3>
            <p className="text-sm text-neutral-300 leading-relaxed">
              {tr(
                "Тўлиқ кўриш, фикр қолдириш ва муҳокама қилиш учун тизимга киринг.",
                "To'liq ko'rish, fikr qoldirish va muhokama qilish uchun tizimga kiring.",
                "Войдите в систему, чтобы слушать полностью, оставлять комментарии и участвовать в обсуждениях.",
                "Sign in to listen fully, leave comments, and participate in discussions."
              )}
            </p>
            <div className="flex gap-3 w-full mt-2">
              <button onClick={() => router.push("/auth/login")} className="flex-1 py-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white font-semibold text-sm transition cursor-pointer">
                {tr("Кириш", "Kirish", "Войти", "Sign In")}
              </button>
              <button onClick={() => router.push("/auth/register")} className="flex-1 py-3 rounded-xl bg-[#39FF14] hover:bg-[#32e012] text-black font-bold text-sm transition cursor-pointer">
                {tr("Рўйхатдан ўтиш", "Ro'yxatdan o'tish", "Регистрация", "Register")}
              </button>
            </div>
            <button onClick={() => setShowDemoModal(false)} className="text-xs text-neutral-400 hover:text-white mt-1 transition underline bg-transparent border-none cursor-pointer">
              {tr("Ёпиш", "Yopish", "Закрыть", "Close")}
            </button>
          </div>
        </div>
      )}

      {/* МОДАЛЬНОЕ ОКНО ЧАТА ДЛЯ АУДИО */}
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
              <Discussion targetId={currentTrack.id} />
            </div>
          </div>
        </div>
      )}

      {/* ВИДЕОПЛЕЕР (ЕСЛИ ЭТО КЛИП) */}
      {hasVideo ? (
        isMinimizedVideo ? (
          <div className="fixed bottom-6 right-6 z-50 w-80 bg-neutral-900 border border-neutral-700 rounded-2xl overflow-hidden shadow-[0_10px_30px_rgba(0,0,0,0.8)] animate-fadeIn">
            <div className="relative aspect-video bg-black flex items-center justify-center group cursor-pointer" onClick={() => setIsMinimizedVideo(false)}>
              <video ref={mediaRef as React.RefObject<HTMLVideoElement>} src={mediaSrc} preload="metadata" onTimeUpdate={handleTimeUpdate} onLoadedMetadata={handleLoadedMetadata} onEnded={() => nextTrack()} className="w-full h-full object-cover" />
            </div>
            <div className="p-3 bg-neutral-900 flex items-center justify-between">
              <div className="truncate pr-2">
                <h4 className="font-semibold text-xs text-white truncate">{currentTrack.title}</h4>
                <p className="text-[10px] text-neutral-400 truncate">{currentTrack.singer}</p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button onClick={handleTogglePlaySecure} className="p-1.5 rounded-full bg-emerald-500 text-neutral-950 hover:bg-emerald-400 transition cursor-pointer border-none">
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
              
              {/* Левая часть: видео */}
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
                  <video ref={mediaRef as React.RefObject<HTMLVideoElement>} src={mediaSrc} preload="metadata" onTimeUpdate={handleTimeUpdate} onLoadedMetadata={handleLoadedMetadata} onEnded={() => nextTrack()} className="w-full h-full object-contain" />
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
                      <button onClick={handleTogglePlaySecure} className="p-2.5 rounded-full bg-emerald-500 hover:bg-emerald-600 text-neutral-950 cursor-pointer transition border-none shadow-[0_0_15px_rgba(16,185,129,0.3)]">
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

              {/* Правая часть: универсальный компонент Discussion */}
              <div className="w-full lg:w-96 flex flex-col h-72 lg:h-full p-3 bg-neutral-950">
                <Discussion targetId={currentTrack.id} />
              </div>

            </div>
          </div>
        )
      ) : (
        /* АУДИОПЛЕЕР (НИЖНЯЯ ПАНЕЛЬ) */
        <div className="fixed bottom-0 left-0 right-0 bg-neutral-900 border-t border-neutral-800 text-white z-50 shadow-2xl p-4">
          <audio ref={mediaRef as React.RefObject<HTMLAudioElement>} src={mediaSrc} preload="metadata" onTimeUpdate={handleTimeUpdate} onLoadedMetadata={handleLoadedMetadata} onEnded={() => nextTrack()} />

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
              <button onClick={handleTogglePlaySecure} className="p-2.5 rounded-full bg-amber-500 hover:bg-amber-600 text-neutral-950 cursor-pointer transition flex-shrink-0 border-none">
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
                <div className="absolute top-0 left-0 bottom-0 bg-amber-500 transition-all duration-75" style={{ width: `${volumePercent}%` }} />
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