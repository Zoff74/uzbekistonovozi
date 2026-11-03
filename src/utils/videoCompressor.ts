// src/utils/videoCompressor.ts

export async function compressVideoOnClient(
    file: File,
    onProgress?: (progress: number) => void
): Promise<File> {
    return new Promise((resolve, reject) => {
        if (!file || !(file instanceof Blob)) {
            return reject(new Error("В функцию сжатия не передан объект файла (File/Blob)"));
        }

        const MAX_SIZE_BYTES = 19.5 * 1024 * 1024; // Лимит Telegram (~19.5 Мб)

        if (file.size <= MAX_SIZE_BYTES) {
            console.log(`✅ Размер файла ${(file.size / (1024 * 1024)).toFixed(2)} MB уже в норме. Пропускаем сжатие.`);
            return resolve(file);
        }

        console.log("🧠 Старт качественного сжатия под ~18.5 Мб в 720p (без кубиков и с плавным прогрессом):", {
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

                // 🧮 Точный расчет под 18.5 Мб
                const targetMaxBytes = 18.5 * 1024 * 1024; 
                const totalTargetBits = targetMaxBytes * 8;
                const audioBitrate = 128000; // 128 kbps для отличного звука гитары
                const totalAudioBits = audioBitrate * duration;
                
                const availableVideoBits = totalTargetBits - totalAudioBits;
                const calculatedVideoBitrate = Math.floor(availableVideoBits / duration);

                // 🔥 Высокий минимальный порог (от 1.5 Mbps до 2.5 Mbps), чтобы струны и пальцы не рассыпались в пиксели
                const optimalVideoBitrate = Math.min(Math.max(calculatedVideoBitrate, 1500000), 2500000);

                console.log(`📊 Длительность: ${duration.toFixed(1)}с | Видеобитрейт: ${(optimalVideoBitrate / 1000).toFixed(0)} kbps`);

                const canvas = document.createElement('canvas');
                const targetHeight = 720; // ⚡ Чистое HD 720p для детализации гитары
                const scale = targetHeight / video.videoHeight;
                canvas.width = Math.round(video.videoWidth * scale);
                canvas.height = targetHeight;

                const ctx = canvas.getContext('2d', { alpha: false });
                if (!ctx) {
                    URL.revokeObjectURL(objectUrl);
                    return reject(new Error('Не удалось инициализировать Canvas 2D context'));
                }

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

                const videoStream = canvas.captureStream(30); // 30 кадров/сек для плавности движений
                const audioTracks = dest ? dest.stream.getAudioTracks() : [];

                const combinedStream = new MediaStream([
                    ...videoStream.getVideoTracks(),
                    ...audioTracks
                ]);
                
                let mimeType = 'video/webm;codecs=vp9,opus';
                if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm;codecs=vp8,opus';
                if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm';
                if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/mp4';

                let recorder: MediaRecorder;
                try {
                    recorder = new MediaRecorder(combinedStream, {
                        mimeType: mimeType,
                        videoBitsPerSecond: optimalVideoBitrate,
                        audioBitsPerSecond: audioBitrate
                    });
                } catch (e) {
                    recorder = new MediaRecorder(combinedStream);
                }

                const chunks: Blob[] = [];
                recorder.ondataavailable = (e) => {
                    if (e.data && e.data.size > 0) chunks.push(e.data);
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
                    
                    console.log(`📦 Сжатие завершено. Итоговый размер: ${(resultBlob.size / (1024 * 1024)).toFixed(2)} MB`);
                    resolve(new File([resultBlob], newFileName, { type: finalMime }));
                };

                recorder.onerror = (err) => {
                    URL.revokeObjectURL(objectUrl);
                    if (audioCtx && audioCtx.state !== 'closed') {
                        audioCtx.close().catch(() => {});
                    }
                    reject(err);
                };

                // Ждем готовности и запускаем воспроизведение СТРОГО с нулевого кадра
                video.currentTime = 0;

                video.onseeked = async () => {
                    if (audioCtx && audioCtx.state === 'suspended') {
                        await audioCtx.resume();
                    }

                    try {
                        await video.play();
                    } catch (playErr) {
                        video.muted = true;
                        await video.play();
                    }

                    // Отрисовываем первый кадр на канвас ДО старта записи, чтобы убрать черный экран
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

                    // Запускаем запись рекордера ТОЛЬКО после того, как видео реально заиграло
                    recorder.start(250);
                    console.log("▶️ Запись и стриминг запущены с 0:00 без черного экрана.");

                    let currentVisualPercent = 0;

                    const drawFrame = () => {
                        const isReachedEnd = video.ended || (Number.isFinite(duration) && video.currentTime >= duration - 0.2);

                        if (isReachedEnd) {
                            if (recorder.state !== 'inactive') recorder.stop();
                            return;
                        }

                        if (video.paused && !video.ended) {
                            if (video.readyState < 3) {
                                requestAnimationFrame(drawFrame);
                                return;
                            } else {
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
                            // 🔢 Плавный счетчик микропроцентов на экране
                            onProgress(Number(Math.min(Math.max(currentVisualPercent, 0), 99).toFixed(3)));
                        }

                        requestAnimationFrame(drawFrame);
                    };

                    drawFrame();
                };

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