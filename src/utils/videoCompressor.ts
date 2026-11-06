// src/utils/videoCompressor.ts

export async function compressVideoOnClient(
    file: File,
    onProgress?: (progress: number) => void
): Promise<File> {
    return new Promise((resolve, reject) => {
        if (!file || !(file instanceof Blob)) {
            return reject(new Error("В функцию сжатия не передан объект файла (File/Blob)"));
        }

        const MAX_SIZE_BYTES = 19.5 * 1024 * 1024; // Лимит Telegram (< 20MB)

        if (file.size <= MAX_SIZE_BYTES) {
            console.log(`✅ Размер файла ${(file.size / (1024 * 1024)).toFixed(2)} MB уже меньше лимита. Пропускаем сжатие.`);
            if (onProgress) onProgress(100);
            return resolve(file);
        }

        console.log("🧠 Старт точного сжатия с фиксированным потоком кадров:", {
            name: file.name,
            sizeMB: (file.size / (1024 * 1024)).toFixed(2) + " MB"
        });

        const video = document.createElement('video');
        video.preload = 'auto';
        video.muted = false;
        video.playsInline = true;

        const objectUrl = URL.createObjectURL(file);
        video.src = objectUrl;

        video.onloadedmetadata = async () => {
            try {
                video.currentTime = 0;
                video.playbackRate = 1.0;

                const duration = video.duration || 314;

                console.log(`📊 Длительность: ${duration.toFixed(1)}с | Целевой битрейт видео: 450 kbps`);

                const canvas = document.createElement('canvas');
                const targetHeight = 480; // Строго 480p
                const scale = targetHeight / video.videoHeight;
                canvas.width = Math.min(854, Math.round((video.videoWidth * scale) / 2) * 2);
                canvas.height = targetHeight;

                const ctx = canvas.getContext('2d', { alpha: false });
                if (!ctx) {
                    URL.revokeObjectURL(objectUrl);
                    return reject(new Error('Не удалось инициализировать Canvas 2D context'));
                }

                // Захватываем видео с холста на честных 24 кадрах в секунду
                const videoStream = canvas.captureStream(24);
                
                let combinedStream = videoStream;
                if (typeof (video as any).captureStream === 'function') {
                    try {
                        const nativeStream = (video as any).captureStream();
                        const audioTracks = nativeStream.getAudioTracks();
                        if (audioTracks.length > 0) {
                            combinedStream = new MediaStream([
                                ...videoStream.getVideoTracks(),
                                ...audioTracks
                            ]);
                        }
                    } catch (e) {
                        console.warn("⚠️ Нативный захват аудиодорожки пропущен:", e);
                    }
                }

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
                    // Ставим уверенные 450 kbps для видео, чтобы файл весил ~17-18 МБ
                    recorder = new MediaRecorder(combinedStream, {
                        mimeType: mimeType,
                        videoBitsPerSecond: 450000 
                    });
                } catch (e) {
                    console.warn("⚠️ Установка битрейта видео не поддержалась:", e);
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

                    const isWebm = mimeType.includes('webm');
                    const ext = isWebm ? '.webm' : '.mp4';
                    const finalMime = isWebm ? 'video/webm' : 'video/mp4';

                    const resultBlob = new Blob(chunks, { type: finalMime });
                    const newFileName = file.name.replace(/\.[^/.]+$/, '') + ext;
                    
                    console.log(`📦 Сжатие завершено. Итоговый размер: ${(resultBlob.size / (1024 * 1024)).toFixed(2)} MB`);
                    resolve(new File([resultBlob], newFileName, { type: finalMime }));
                };

                recorder.onerror = (err) => {
                    URL.revokeObjectURL(objectUrl);
                    reject(err);
                };

                recorder.start(1000);

                try {
                    await video.play();
                } catch (playErr) {
                    video.muted = true;
                    await video.play();
                }

                let currentVisualPercent = 0;

                // Заменяем requestAnimationFrame на четкий интервал, чтобы браузер не душил частоту кадров
                const intervalTime = 1000 / 24; // Строго 24 кадра в секунду
                const timer = setInterval(() => {
                    const isReachedEnd = video.ended || video.paused || (Number.isFinite(duration) && video.currentTime >= duration - 0.2);

                    if (isReachedEnd || video.currentTime >= duration) {
                        clearInterval(timer);
                        console.log(`🏁 Видео дошло до конца (${video.currentTime.toFixed(1)}с / ${duration.toFixed(1)}с). Останавливаем запись.`);
                        if (recorder.state !== 'inactive') {
                            recorder.stop();
                        }
                        return;
                    }

                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

                    if (onProgress && Number.isFinite(duration) && duration > 0) {
                        const realPercent = (video.currentTime / duration) * 100;
                        
                        if (realPercent > currentVisualPercent) {
                            currentVisualPercent += (realPercent - currentVisualPercent) * 0.1;
                        } else {
                            currentVisualPercent += 0.004; 
                        }

                        const finalPercent = Math.min(Math.max(currentVisualPercent, 0), 99);
                        onProgress(Number(finalPercent.toFixed(3)));
                    }
                }, intervalTime);

            } catch (err) {
                URL.revokeObjectURL(objectUrl);
                reject(err);
            }
        };

        video.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error("Ошибка загрузки видеофайла в элемент превью"));
        };
    });
}