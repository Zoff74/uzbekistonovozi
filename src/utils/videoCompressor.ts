// src/utils/videoCompressor.ts

export async function compressVideoOnClient(
    file: File,
    onProgress?: (progress: number) => void
): Promise<File> {
    return new Promise((resolve, reject) => {
        if (!file || !(file instanceof Blob)) {
            return reject(new Error("В функцию сжатия не передан объект файла (File/Blob)"));
        }

        const MAX_SIZE_BYTES = 20 * 1024 * 1024; // Строгий лимит Telegram (< 20MB)

        // ПРАВИЛО: Если исходный файл уже меньше или равен 20 Мб, не трогаем его
        if (file.size <= MAX_SIZE_BYTES) {
            console.log(`✅ Размер файла ${(file.size / (1024 * 1024)).toFixed(2)} MB уже меньше 20 Мб. Пропускаем сжатие.`);
            return resolve(file);
        }

        console.log("🧠 Старт строгого сжатия под лимит Telegram (<20Мб):", {
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
                video.playbackRate = 1.0;

                const duration = video.duration || 1;

                // 🧮 СТРОГИЙ РАСЧЕТ ПОД ЛИМИТ 18.5 МБ (с запасом до 20 Мб)
                const targetMaxBytes = 18.5 * 1024 * 1024; 
                const totalTargetBits = targetMaxBytes * 8;
                const audioBitrate = 96000; // 96 kbps для качественного звука
                const totalAudioBits = audioBitrate * duration;
                
                const availableVideoBits = totalTargetBits - totalAudioBits;
                const calculatedVideoBitrate = Math.floor(availableVideoBits / duration);

                // Предохранители: не ниже 250 kbps (чтобы не было каши) и не выше 900 kbps (чтобы строго влазить в лимит)
                const optimalVideoBitrate = Math.min(Math.max(calculatedVideoBitrate, 250000), 900000);

                console.log(`📊 Длительность: ${duration.toFixed(1)}с | Битрейт: ${(optimalVideoBitrate / 1000).toFixed(0)} kbps`);

                const canvas = document.createElement('canvas');
                const targetHeight = 480; // СТРОГО 480p для стабильной работы кодека без зависаний на 20-й секунде
                const scale = targetHeight / video.videoHeight;
                canvas.width = Math.round(video.videoWidth * scale);
                canvas.height = targetHeight;

                const ctx = canvas.getContext('2d', { alpha: false });
                if (!ctx) {
                    URL.revokeObjectURL(objectUrl);
                    return reject(new Error('Не удалось инициализировать Canvas 2D context'));
                }

                // Инициализируем AudioContext для захвата звука
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
                    } catch (err) {
                        console.warn("⚠️ Не удалось подключить аудиопоток:", err);
                    }
                }

                const videoStream = canvas.captureStream(30);
                const audioTracks = dest ? dest.stream.getAudioTracks() : [];

                const combinedStream = new MediaStream([
                    ...videoStream.getVideoTracks(),
                    ...audioTracks
                ]);
                
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
                        videoBitsPerSecond: optimalVideoBitrate,
                        audioBitsPerSecond: audioBitrate
                    });
                } catch (e) {
                    console.warn("⚠️ Расширенные параметры MediaRecorder не поддержались:", e);
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
                    
                    console.log(`📦 Сжатие завершено. Итоговый размер: ${(resultBlob.size / (1024 * 1024)).toFixed(2)} MB (Лимит Телеграм: <20MB)`);
                    resolve(new File([resultBlob], newFileName, { type: finalMime }));
                };

                recorder.onerror = (err) => {
                    URL.revokeObjectURL(objectUrl);
                    if (audioCtx && audioCtx.state !== 'closed') {
                        audioCtx.close().catch(() => {});
                    }
                    reject(err);
                };

                recorder.start(100);

                if (audioCtx && audioCtx.state === 'suspended') {
                    await audioCtx.resume();
                }

                try {
                    await video.play();
                } catch (playErr) {
                    video.muted = true;
                    await video.play();
                }

                let currentVisualPercent = 0; // Плавные микропроценты

                const drawFrame = () => {
                    // 1. ЖЕСТКАЯ ПРОВЕРКА КОНЦА ПО ДЛИТЕЛЬНОСТИ
                    const isReachedEnd = video.ended || (Number.isFinite(duration) && video.currentTime >= duration - 0.2);

                    if (isReachedEnd) {
                        console.log(`🏁 Видео дошло до конца (${video.currentTime.toFixed(1)}с / ${duration.toFixed(1)}с). Останавливаем запись.`);
                        if (recorder.state !== 'inactive') {
                            recorder.stop();
                        }
                        return;
                    }

                    // 2. ЗАЩИТА ОТ ЗАВИСАНИЯ В НАЧАЛЕ ИЛИ СЕРЕДИНЕ (Буферизация)
                    if (video.paused && !video.ended) {
                        if (video.readyState < 3) {
                            // Данные еще докачиваются из Blob — ждем следующий кадр, не обрывая запись
                            requestAnimationFrame(drawFrame);
                            return;
                        } else {
                            // Плеер готов, но встал — принудительно толкаем дальше
                            video.play().catch(() => {});
                        }
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