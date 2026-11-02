// src/utils/videoCompressor.ts

export async function compressVideoOnClient(
    file: File,
    onProgress?: (progress: number) => void
): Promise<File> {
    return new Promise((resolve, reject) => {
        if (!file || !(file instanceof Blob)) {
            return reject(new Error("В функцию сжатия не передан объект файла (File/Blob)"));
        }

        console.log("📁 Старт нативного сжатия файла:", {
            name: file.name,
            sizeMB: (file.size / (1024 * 1024)).toFixed(2) + " MB"
        });

        const video = document.createElement('video');
        video.preload = 'metadata';
        video.muted = true;
        video.playsInline = true;

        const objectUrl = URL.createObjectURL(file);
        video.src = objectUrl;

        video.onloadedmetadata = async () => {
            try {
                video.currentTime = 0;

                const canvas = document.createElement('canvas');
                const targetHeight = 480; // Снижаем до 480p для уменьшения веса
                const scale = targetHeight / video.videoHeight;
                canvas.width = Math.round(video.videoWidth * scale);
                canvas.height = targetHeight;

                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    URL.revokeObjectURL(objectUrl);
                    return reject(new Error('Не удалось инициализировать Canvas 2D context'));
                }

                // Захват потока с canvas (30 кадров/сек)
                const stream = canvas.captureStream(30);
                
                // Подбираем поддерживаемый MIME-тип для записи
                let mimeType = 'video/webm;codecs=vp9';
                if (!MediaRecorder.isTypeSupported(mimeType)) {
                    mimeType = 'video/webm';
                }
                if (!MediaRecorder.isTypeSupported(mimeType)) {
                    mimeType = 'video/mp4';
                }

                let recorder: MediaRecorder;
                try {
                    recorder = new MediaRecorder(stream, {
                        mimeType: mimeType,
                        videoBitsPerSecond: 400000 // Ограничиваем битрейт до ~400 kbps для компактного размера
                    });
                } catch (e) {
                    recorder = new MediaRecorder(stream);
                }

                const chunks: Blob[] = [];
                recorder.ondataavailable = (e) => {
                    if (e.data && e.data.size > 0) {
                        chunks.push(e.data);
                    }
                };

                recorder.onstop = () => {
                    URL.revokeObjectURL(objectUrl);
                    const resultBlob = new Blob(chunks, { type: 'video/mp4' });
                    const newFileName = file.name.replace(/\.[^/.]+$/, '') + '.mp4';
                    
                    console.log("📦 Сжатие завершено. Новый размер:", (resultBlob.size / (1024 * 1024)).toFixed(2) + " MB");
                    resolve(new File([resultBlob], newFileName, { type: 'video/mp4' }));
                };

                recorder.onerror = (err) => {
                    URL.revokeObjectURL(objectUrl);
                    reject(err);
                };

                recorder.start();
                video.play();

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
                reject(err);
            }
        };

        video.onerror = (err) => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error("Ошибка загрузки видеофайла в элемент превью"));
        };
    });
}