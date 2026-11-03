// src/utils/videoCompressor.ts

export async function compressVideoOnClient(
    file: File,
    onProgress?: (progress: number) => void
): Promise<File> {
    return new Promise((resolve, reject) => {
        if (!file || !(file instanceof Blob)) {
            return reject(new Error("В функцию сжатия не передан объект файла (File/Blob)"));
        }

        console.log("📁 Старт нативного сжатия файла со звуком:", {
            name: file.name,
            sizeMB: (file.size / (1024 * 1024)).toFixed(2) + " MB"
        });

        const video = document.createElement('video');
        video.preload = 'auto';
        video.muted = false;
        video.playsInline = true;

        const objectUrl = URL.createObjectURL(file);
        video.src = objectUrl;

        let audioCtx: AudioContext | null = null;

        video.onloadedmetadata = async () => {
            try {
                video.currentTime = 0;

                const canvas = document.createElement('canvas');
                const targetHeight = 480; // 480p для компактного веса и стабильной производительности
                const scale = targetHeight / video.videoHeight;
                canvas.width = Math.round(video.videoWidth * scale);
                canvas.height = targetHeight;

                const ctx = canvas.getContext('2d', { alpha: false });
                if (!ctx) {
                    URL.revokeObjectURL(objectUrl);
                    return reject(new Error('Не удалось инициализировать Canvas 2D context'));
                }

                // Инициализируем AudioContext для захвата звуковой дорожки
                try {
                    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
                    audioCtx = new AudioContextClass();
                    if (audioCtx.state === 'suspended') {
                        await audioCtx.resume();
                    }
                } catch (e) {
                    console.warn("⚠️ AudioContext не поддерживается:", e);
                }

                const dest = audioCtx ? audioCtx.createMediaStreamDestination() : null;
                let sourceNode: MediaElementAudioSourceNode | null = null;
                
                if (audioCtx && dest) {
                    try {
                        sourceNode = audioCtx.createMediaElementSource(video);
                        sourceNode.connect(dest);
                        // Важно: НЕ подключаем к audioCtx.destination, чтобы звук не дублировался наружу в динамики!
                    } catch (err) {
                        console.warn("⚠️ Не удалось подключить аудиопоток из видео:", err);
                    }
                }

                // Захват видеопотока с Canvas (30 кадров/сек)
                const videoStream = canvas.captureStream(30);
                const audioTracks = dest ? dest.stream.getAudioTracks() : [];

                // Объединяем видео и аудио в единый поток
                const combinedStream = new MediaStream([
                    ...videoStream.getVideoTracks(),
                    ...audioTracks
                ]);
                
                // Подбираем поддерживаемый MIME-тип с поддержкой видео и аудио (VP9/VP8 + Opus)
                let mimeType = 'video/webm;codecs=vp9,opus';
                if (!MediaRecorder.isTypeSupported(mimeType)) {
                    mimeType = 'video/webm;codecs=vp8,opus';
                }
                if (!MediaRecorder.isTypeSupported(mimeType)) {
                    mimeType = 'video/webm';
                }
                if (!MediaRecorder.isTypeSupported(mimeType)) {
                    mimeType = 'video/mp4';
                }

                let recorder: MediaRecorder;
                try {
                    recorder = new MediaRecorder(combinedStream, {
                        mimeType: mimeType,
                        videoBitsPerSecond: 600000, // Оптимальный битрейт видео ~600 kbps для плавности и качества
                        audioBitsPerSecond: 128000  // Битрейт аудио 128 kbps для чистейшего звука
                    });
                } catch (e) {
                    console.warn("⚠️ Расширенные параметры MediaRecorder не поддерживаются, используем стандартные:", e);
                    recorder = new MediaRecorder(combinedStream);
                }

                const chunks: Blob[] = [];
                recorder.ondataavailable = (e) => {
                    if (e.data && e.data.size > 0) {
                        chunks.push(e.data);
                    }
                };

                recorder.onstop = () => {
                    URL.revokeObjectURL(objectUrl);
                    if (audioCtx && audioCtx.state !== 'closed') {
                        audioCtx.close().catch(() => {});
                    }

                    const isWebm = mimeType.includes('webm');
                    const ext = isWebm ? '.webm' : '.mp4';
                    const finalMime = isWebm ? 'video/webm' : 'video/mp4';

                    const resultBlob = new Blob(chunks, { type: finalMime });
                    const newFileName = file.name.replace(/\.[^/.]+$/, '') + ext;
                    
                    console.log("📦 Сжатие завершено. Размер:", (resultBlob.size / (1024 * 1024)).toFixed(2) + " MB", "Формат:", finalMime);
                    resolve(new File([resultBlob], newFileName, { type: finalMime }));
                };

                recorder.onerror = (err) => {
                    URL.revokeObjectURL(objectUrl);
                    if (audioCtx && audioCtx.state !== 'closed') {
                        audioCtx.close().catch(() => {});
                    }
                    reject(err);
                };

                // Запуск записи и воспроизведения
                recorder.start(100); // Собираем чанки каждые 100мс
                video.play().catch((err) => {
                    console.error("Ошибка воспроизведения видео при сжатии:", err);
                    reject(err);
                });

                const duration = video.duration || 1;
                const drawFrame = () => {
                    if (video.ended || video.paused) {
                        if (recorder.state !== 'inactive') {
                            recorder.stop();
                        }
                        return;
                    }

                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

                    if (onProgress) {
                        const percent = Math.min(Math.round((video.currentTime / duration) * 100), 99);
                        onProgress(percent);
                    }

                    requestAnimationFrame(drawFrame);
                };

                drawFrame();

            } catch (err) {
                URL.revokeObjectURL(objectUrl);
                if (audioCtx && audioCtx.state !== 'closed') {
                    audioCtx.close().catch(() => {});
                }
                reject(err);
            }
        };

        video.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error("Ошибка загрузки видеофайла в элемент превью"));
        };
    });
}