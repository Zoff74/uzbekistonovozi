// src/utils/videoCompressor.ts

export async function compressVideoOnClient(
    file: File,
    onProgress?: (progress: number) => void
): Promise<File> {
    return new Promise((resolve, reject) => {
        if (!file || !(file instanceof Blob)) {
            return reject(new Error("В функцию сжатия не передан объект файла (File/Blob)"));
        }

        const MAX_SIZE_BYTES = 20 * 1024 * 1024; // Строгий лимит 20 Мб

        // ПРАВИЛО: Если исходный файл уже меньше или равен 20 Мб, не трогаем его
        if (file.size <= MAX_SIZE_BYTES) {
            console.log(`✅ Размер файла ${(file.size / (1024 * 1024)).toFixed(2)} MB уже меньше 20 Мб. Пропускаем сжатие.`);
            return resolve(file);
        }

        console.log("🧠 Старт умного нативного сжатия (цель < 20 Мб):", {
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

                // 🧮 ЖЕСТКИЙ РАСЧЕТ ПОД ЛИМИТ < 20 МБ
                // Целимся в 18 Мб, чтобы с запасом уложиться в ограничение
                const targetMaxBytes = 18 * 1024 * 1024; 
                const totalTargetBits = targetMaxBytes * 8;
                const audioBitrate = 96000; // 96 kbps для аудио (достаточно для голоса/музыки, экономит место)
                const totalAudioBits = audioBitrate * duration;
                
                const availableVideoBits = totalTargetBits - totalAudioBits;
                const calculatedVideoBitrate = Math.floor(availableVideoBits / duration);

                // Предохранители: не ниже 300 kbps (чтобы не превращалось в кашу) и не выше 1000 kbps
                const optimalVideoBitrate = Math.min(Math.max(calculatedVideoBitrate, 300000), 1000000);

                console.log(`📊 Длительность: ${duration.toFixed(1)}с | Расчетный видеобитрейт: ${(optimalVideoBitrate / 1000).toFixed(0)} kbps`);

                const canvas = document.createElement('canvas');
                const targetHeight = 480; // 480p для десктопа
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
                    
                    console.log(`📦 Сжатие завершено. Итоговый размер: ${(resultBlob.size / (1024 * 1024)).toFixed(2)} MB (Лимит: <20MB)`);
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