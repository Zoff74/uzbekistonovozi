"use client";

import { usePlayer } from "@/context/PlayerContext";
import { Play, Pause, Volume2, VolumeX, X, SkipBack, SkipForward, Minimize2, Film, MessageSquare, Music, RotateCcw } from "lucide-react";
import { useRef, useEffect, useState } from "react";
import { tr } from "@/utils/translate";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import Discussion from "@/components/Discussion";

export default function Player() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const { currentTrack, isPlaying, togglePlay, closePlayer, nextTrack, prevTrack } = usePlayer();
  
  const mediaRef = useRef<HTMLAudioElement | HTMLVideoElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isMinimizedVideo, setIsMinimizedVideo] = useState(false);
  const [showAudioChatModal, setShowAudioChatModal] = useState(false);

  const [localVideoSrc, setLocalVideoSrc] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [downloadError, setDownloadError] = useState<boolean>(false);
  const [retryTrigger, setRetryTrigger] = useState<number>(0);

  const isAuthenticated = status === "authenticated" && Boolean(session?.user);
  const trackId = currentTrack?.id || currentTrack?._id;
  const hasVideo = Boolean(
    currentTrack?.videoUrl ||
    (currentTrack as any)?.telegramUrl ||
    (currentTrack as any)?.videoFileId
  );

  // 🚀 Многопоточная загрузка видео по принципу IDM (4 сегмента + микропроценты 0.0000% + кэш v5)
  useEffect(() => {
    let isCancelled = false;
    const abortController = new AbortController();

    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }

    if (!trackId) {
      setLocalVideoSrc(null);
      setIsDownloading(false);
      setDownloadProgress(0);
      setDownloadError(false);
      return;
    }

    setIsMinimizedVideo(false);
    setLocalVideoSrc(null);
    setDownloadProgress(0);
    setDownloadError(false);
    setCurrentTime(0);
    setDuration(0);

    if (!hasVideo) {
      setIsDownloading(false);
      return;
    }

    setIsDownloading(true);
    
    async function downloadAndCacheVideoIDM() {
      const streamUrl = `/api/videos/stream/${trackId}`;

      try {
        // Удаляем все старые версии кэша с поврежденными/сдвинутыми сегментами
        await caches.delete("uzbekistonovozi-video-cache-v2").catch(() => {});
        await caches.delete("uzbekistonovozi-video-cache-v3").catch(() => {});
        await caches.delete("uzbekistonovozi-video-cache-v4").catch(() => {});

        const cacheName = "uzbekistonovozi-video-cache-v5";
        const cache = await caches.open(cacheName);
        const cacheKey = new Request(streamUrl);

        // 1. Проверяем, есть ли уже целый файл в чистом кэше v5
        const cachedResponse = await cache.match(cacheKey);
        if (cachedResponse) {
          const blob = await cachedResponse.blob();
          if (blob.size > 1024) {
            if (!isCancelled) {
              const objUrl = URL.createObjectURL(blob);
              blobUrlRef.current = objUrl;
              setLocalVideoSrc(objUrl);
              setIsDownloading(false);
              setDownloadProgress(100);
            }
            return;
          } else {
            await cache.delete(cacheKey);
          }
        }

        // 2. Пробный запрос bytes=0-0 (1 байт), чтобы мгновенно узнать точный размер и тип файла
        const probeRes = await fetch(streamUrl, {
          headers: { Range: "bytes=0-0" },
          signal: abortController.signal,
        });

        if (!probeRes.ok) {
          throw new Error(`HTTP ${probeRes.status}`);
        }

        let totalLength = Number(probeRes.headers.get("X-Total-Size") || 0);
        if (!totalLength) {
          const contentRange = probeRes.headers.get("Content-Range") || "";
          const match = contentRange.match(/\/(\d+)$/);
          if (match) totalLength = Number(match[1]);
        }
        const contentType = probeRes.headers.get("Content-Type") || "video/mp4";
        await probeRes.body?.cancel().catch(() => {});

        if (!totalLength || totalLength <= 0) {
          throw new Error("Не удалось определить размер видеофайла");
        }

        // 3. Делим файл на 4 сегмента (выровненных по 4096 байт) для файлов больше 5 МБ, иначе 1 поток
        const THREADS = totalLength > 5 * 1024 * 1024 ? 4 : 1;
        const rawSegmentSize = Math.ceil(totalLength / THREADS);
        const alignedSegmentSize = Math.ceil(rawSegmentSize / 4096) * 4096;

        const segments: { start: number; end: number }[] = [];
        for (let i = 0; i < THREADS; i++) {
          const start = i * alignedSegmentSize;
          if (start >= totalLength) break;
          const end = Math.min(totalLength - 1, (i + 1) * alignedSegmentSize - 1);
          segments.push({ start, end });
        }

        const threadProgress = new Array<number>(segments.length).fill(0);
        const updateTotalProgress = () => {
          if (isCancelled) return;
          const totalReceived = threadProgress.reduce((acc, v) => acc + v, 0);
          const exactPercent = Math.min(99.9999, (totalReceived / totalLength) * 100);
          setDownloadProgress(exactPercent);
        };

        // Функция скачивания сегмента с побайтовой верификацией Content-Range
        const downloadSegment = async (segIndex: number, segStart: number, segEnd: number): Promise<Blob> => {
          const expectedBytes = segEnd - segStart + 1;
          let receivedInSeg = 0;
          const segChunks: Uint8Array[] = [];
          let retries = 0;
          const maxRetries = 8;

          while (receivedInSeg < expectedBytes) {
            if (isCancelled) throw new Error("Cancelled");

            try {
              const currentStart = segStart + receivedInSeg;
              const res = await fetch(streamUrl, {
                headers: { Range: `bytes=${currentStart}-${segEnd}` },
                signal: abortController.signal,
              });

              if (!res.ok || !res.body) {
                throw new Error(`HTTP ${res.status}`);
              }

              // Проверяем фактический стартовый байт из Content-Range
              let serverStart = 0;
              if (res.status === 206) {
                const cr = res.headers.get("Content-Range") || "";
                const m = cr.match(/bytes\s+(\d+)-(\d+)\/(\d+)/i);
                if (m) {
                  serverStart = Number(m[1]);
                } else {
                  serverStart = currentStart;
                }
              }

              if (serverStart > currentStart) {
                throw new Error(`Сервер вернул смещенный диапазон: ${serverStart} > ${currentStart}`);
              }

              let bytesToSkip = currentStart - serverStart;

              const reader = res.body.getReader();
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                if (isCancelled) {
                  reader.cancel();
                  throw new Error("Cancelled");
                }

                let chunk = value;
                if (bytesToSkip > 0) {
                  if (chunk.length <= bytesToSkip) {
                    bytesToSkip -= chunk.length;
                    continue;
                  }
                  chunk = chunk.subarray(bytesToSkip);
                  bytesToSkip = 0;
                }

                const needed = expectedBytes - receivedInSeg;
                if (chunk.length > needed) {
                  chunk = chunk.subarray(0, needed);
                }

                segChunks.push(chunk);
                receivedInSeg += chunk.length;
                threadProgress[segIndex] = Math.min(expectedBytes, receivedInSeg);
                updateTotalProgress();

                if (receivedInSeg >= expectedBytes) {
                  await reader.cancel().catch(() => {});
                  break;
                }
              }

              if (receivedInSeg < expectedBytes) {
                throw new Error("Неполный сегмент, докачиваем остаток");
              }
            } catch (err: any) {
              if (isCancelled || err?.name === "AbortError" || err?.message === "Cancelled") {
                throw err;
              }
              retries += 1;
              if (retries > maxRetries) {
                throw err;
              }
              await new Promise((r) => setTimeout(r, 800));
            }
          }

          return new Blob(segChunks as unknown as BlobPart[]);
        };

        // 4. Запускаем все 4 потока одновременно и ждем завершения всех сегментов
        const segmentBlobs = await Promise.all(
          segments.map((seg, idx) => downloadSegment(idx, seg.start, seg.end))
        );

        if (isCancelled) return;

        // 5. Склеиваем сегменты по порядку в единый оригинальный видеофайл
        const finalBlob = new Blob(segmentBlobs, { type: contentType });

        if (finalBlob.size !== totalLength) {
          throw new Error(`Несовпадение размера: получено ${finalBlob.size}, ожидалось ${totalLength}`);
        }

        // 6. Сохраняем готовый файл в кэш браузера
        await cache.put(cacheKey, new Response(finalBlob));

        if (!isCancelled) {
          const objUrl = URL.createObjectURL(finalBlob);
          blobUrlRef.current = objUrl;
          setLocalVideoSrc(objUrl);
          setIsDownloading(false);
          setDownloadProgress(100);
        }
      } catch (err) {
        if (isCancelled) return;
        console.error("⚠️ Не удалось завершить загрузку видео в кэш:", err);
        setLocalVideoSrc(null);
        setIsDownloading(false);
        setDownloadError(true);
      }
    }

    downloadAndCacheVideoIDM();

    return () => {
      isCancelled = true;
      abortController.abort();
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [trackId, hasVideo, retryTrigger]);

  const handleMediaError = (e: React.SyntheticEvent<HTMLVideoElement | HTMLAudioElement, Event>) => {
    if (!e.currentTarget.getAttribute("src")) return;
    console.warn("⚠️ Ошибка воспроизведения медиафайла.");
  };

  useEffect(() => {
    const media = mediaRef.current;
    if (!media || !currentTrack) return;

    const canStartPlayback = hasVideo
      ? !isDownloading && Boolean(localVideoSrc)
      : true;

    if (isPlaying && canStartPlayback) {
      media.play().catch((err) => {
        if (err.name !== "AbortError") {
          console.error("🔥 Ошибка play():", err.message);
        }
      });
    } else {
      media.pause();
    }
  }, [isPlaying, trackId, hasVideo, isDownloading, localVideoSrc]);

  useEffect(() => {
    if (mediaRef.current) {
      mediaRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  if (!currentTrack || (!isAuthenticated && pathname === "/")) {
    return null;
  }
  
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
    const newTime = ((e.clientX - rect.left) / rect.width) * duration;
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
  const formattedDownloadPercent = downloadProgress.toFixed(4);

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
            <div className="relative aspect-video bg-black flex items-center justify-center group cursor-pointer" onClick={() => !isDownloading && !downloadError && setIsMinimizedVideo(false)}>
              {downloadError ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setRetryTrigger((n) => n + 1);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 text-neutral-950 text-xs font-semibold border-none cursor-pointer"
                >
                  <RotateCcw size={14} />
                  <span>Повторить</span>
                </button>
              ) : isDownloading || !mediaSrc ? (
                <div className="relative w-full h-full flex flex-col items-center justify-center gap-2 p-4 text-center">
                  {currentTrack?.cover && (
                    <img src={currentTrack.cover} alt={currentTrack.title} className="absolute inset-0 w-full h-full object-cover opacity-30 blur-[2px]" />
                  )}
                  <div className="relative z-10 w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                  <span className="relative z-10 text-xs text-emerald-400 font-mono font-bold">Загрузка: {formattedDownloadPercent}%</span>
                </div>
              ) : (
                <video 
                  ref={mediaRef as React.RefObject<HTMLVideoElement>} 
                  src={mediaSrc} 
                  poster={currentTrack?.cover || undefined}
                  preload="auto"
                  playsInline
                  controlsList="nodownload"
                  disablePictureInPicture
                  onContextMenu={(e) => e.preventDefault()}
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
                <button onClick={togglePlay} disabled={isDownloading || !mediaSrc} className="p-1.5 rounded-full bg-emerald-500 text-neutral-950 hover:bg-emerald-400 transition cursor-pointer border-none disabled:opacity-50">
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
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 overflow-hidden">
                      {currentTrack?.cover ? (
                        <img src={currentTrack.cover} alt={currentTrack.title} className="w-full h-full object-cover" />
                      ) : (
                        <Film size={18} />
                      )}
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
                  {downloadError ? (
                    <div className="flex flex-col items-center justify-center gap-4 p-6 text-center">
                      <span className="text-sm font-semibold text-red-400">Ошибка соединения при загрузке видео ({formattedDownloadPercent}%)</span>
                      <button
                        onClick={() => setRetryTrigger((n) => n + 1)}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-neutral-950 text-xs font-bold transition cursor-pointer border-none"
                      >
                        <RotateCcw size={16} />
                        <span>Повторить загрузку</span>
                      </button>
                    </div>
                  ) : isDownloading || !mediaSrc ? (
                    <div className="relative w-full h-full flex flex-col items-center justify-center gap-4 p-6 text-center">
                      {currentTrack?.cover && (
                        <img
                          src={currentTrack.cover}
                          alt={currentTrack.title}
                          className="absolute inset-0 w-full h-full object-cover opacity-25 blur-sm pointer-events-none"
                        />
                      )}
                      <div className="relative z-10 flex flex-col items-center gap-4 max-w-md w-full bg-neutral-950/85 border border-neutral-800 rounded-2xl p-6 shadow-2xl">
                        <div className="w-14 h-14 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                        <div className="flex flex-col gap-2 w-full">
                          <span className="text-lg font-mono font-bold text-emerald-400 tabular-nums">
                            {formattedDownloadPercent}%
                          </span>
                          <div className="w-full h-2.5 bg-neutral-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 transition-all duration-75"
                              style={{ width: `${downloadProgress}%` }}
                            />
                          </div>
                          <span className="text-xs text-neutral-400">
                            Идет многопоточная загрузка видео... Дождитесь окончания
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <video 
                      ref={mediaRef as React.RefObject<HTMLVideoElement>} 
                      src={mediaSrc} 
                      poster={currentTrack?.cover || undefined}
                      preload="auto"
                      playsInline
                      controlsList="nodownload"
                      disablePictureInPicture
                      onClick={togglePlay}
                      onContextMenu={(e) => e.preventDefault()}
                      onTimeUpdate={handleTimeUpdate} 
                      onLoadedMetadata={handleLoadedMetadata} 
                      onEnded={() => nextTrack()} 
                      onError={handleMediaError} 
                      className="w-full h-full object-contain cursor-pointer" 
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
                      <button onClick={togglePlay} disabled={isDownloading || !mediaSrc} className="p-2.5 rounded-full bg-emerald-500 hover:bg-emerald-600 text-neutral-950 cursor-pointer transition border-none shadow-[0_0_15px_rgba(16,185,129,0.3)] disabled:opacity-50">
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
          {mediaSrc && (
            <audio
              ref={mediaRef as React.RefObject<HTMLAudioElement>}
              src={mediaSrc}
              preload="metadata"
              controlsList="nodownload"
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onEnded={() => nextTrack()}
              onError={handleMediaError}
            />
          )}

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