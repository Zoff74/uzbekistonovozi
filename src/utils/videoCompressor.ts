// src/utils/videoCompressor.ts
import { Output, WebMOutputFormat, BufferTarget, CanvasSource, Quality } from 'mediabunny';

export async function compressVideoWithWebCodecs(
    file: File,
    onProgress?: (progress: number) => void
): Promise<File> {
    if (!file || !(file instanceof Blob)) {
        throw new Error("В функцию сжатия не передан объект файла");
    }

    const MAX_SIZE_BYTES = 19.5 * 1024 * 1024; // Лимит Telegram (< 19.5 МБ)
    if (file.size <= MAX_SIZE_BYTES) {
        console.log(`✅ Размер файла ${(file.size / (1024 * 1024)).toFixed(2)} MB уже в норме. Пропускаем.`);
        return file;
    }

    const hasWebCodecs = typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';

    if (hasWebCodecs) {
        try {
            console.log("🚀 Запуск нативного потокового сжатия через Mediabunny (CanvasSource + WebCodecs)...");
            return await compressWithMediabunnyEngine(file, onProgress);
        } catch (e) {
            console.warn("⚠️ Mediabunny / WebCodecs не удалось выполнить, переключаемся на MediaRecorder:", e);
        }
    }

    console.log("🔄 Запуск универсального сжатия через MediaRecorder...");
    return await compressWithMediaRecorderFallback(file, onProgress);
}

// Движок на базе Mediabunny + CanvasSource + WebCodecs
async function compressWithMediabunnyEngine(file: File, onProgress?: (progress: number) => void): Promise<File> {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;

    const objectUrl = URL.createObjectURL(file);
    video.src = objectUrl;

    await new Promise((resolve, reject) => {
        video.onloadedmetadata = () => resolve(true);
        video.onerror = () => reject(new Error("Ошибка загрузки видео"));
    });

    const duration = video.duration || 1;
    const targetHeight = 480; 
    const scale = targetHeight / video.videoHeight;
    const calculatedWidth = Math.round((video.videoWidth * scale) / 2) * 2;
    const targetWidth = calculatedWidth > 854 ? 854 : calculatedWidth;

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d', { alpha: false });

    if (!ctx) {
        URL.revokeObjectURL(objectUrl);
        throw new Error("Не удалось создать 2D контекст холста");
    }

    // Расчет битрейта под Telegram-эталон (< 19.5 МБ)
    const targetMaxBytes = 18.5 * 1024 * 1024;
    const totalTargetBits = targetMaxBytes * 8;
    const audioBitrate = 64 * 1000; 
    const availableVideoBits = totalTargetBits - (audioBitrate * duration);
    const finalVideoBitrate = Math.max(400000, Math.min(900000, Math.floor(availableVideoBits / duration)));
    
    console.log(`📊 Эталонный битрейт видео: ${(finalVideoBitrate / 1000).toFixed(0)} kbps (длительность: ${duration.toFixed(1)}с)`);

    const target = new BufferTarget();
    const output = new Output({
        format: new WebMOutputFormat(),
        target,
    });

    const fps = 25;
    const frameInterval = 1 / fps;
    const totalEstimatedFrames = Math.floor(duration * fps);

    const canvasSource = new CanvasSource(canvas, {
        codec: 'vp9',
        quality: new Quality({ bitrate: finalVideoBitrate }),
    });

    output.addVideoTrack(canvasSource, {
        frameRate: fps,
    });

    await output.start();

    try {
        let currentTime = 0;
        let encodedFrames = 0;

        while (currentTime < duration) {
            video.currentTime = currentTime;
            
            // Ждем завершения seek кадра
            await new Promise((r) => {
                const handler = () => {
                    video.removeEventListener('seeked', handler);
                    r(true);
                };
                video.addEventListener('seeked', handler);
                // Защита от зависания seek
                setTimeout(r, 100);
            });

            ctx.drawImage(video, 0, 0, targetWidth, targetHeight);

            const isKeyFrame = encodedFrames % 50 === 0;
            await canvasSource.add(currentTime, frameInterval, isKeyFrame ? { keyFrame: true } : undefined);

            encodedFrames++;
            currentTime += frameInterval;

            if (onProgress && totalEstimatedFrames > 0) {
                const percent = Math.min(99, (encodedFrames / totalEstimatedFrames) * 100);
                onProgress(Number(percent.toFixed(2)));
            }
        }

        await output.finalize();
        URL.revokeObjectURL(objectUrl);
        video.remove();

        const buffer = target.buffer;
        if (!buffer) {
            throw new Error("Буфер сжатого файла пуст");
        }
        const resultBlob = new Blob([buffer], { type: 'video/webm' });
        const compressedFile = new File([resultBlob], file.name.replace(/\.[^/.]+$/, '') + '.webm', { type: 'video/webm' });

        console.log(`📦 Сжатие через Mediabunny завершено. Итоговый размер: ${(compressedFile.size / (1024 * 1024)).toFixed(2)} MB`);
        if (onProgress) onProgress(100);
        return compressedFile;

    } catch (err) {
        URL.revokeObjectURL(objectUrl);
        video.remove();
        throw err;
    }
}

// Фоллбек через MediaRecorder
async function compressWithMediaRecorderFallback(file: File, onProgress?: (progress: number) => void): Promise<File> {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;

    const objectUrl = URL.createObjectURL(file);
    video.src = objectUrl;

    await new Promise((resolve, reject) => {
        video.onloadedmetadata = () => resolve(true);
        video.onerror = () => reject(new Error("Ошибка загрузки видео для фоллбека"));
    });

    const duration = video.duration || 1;
    const targetHeight = 480;
    const scale = targetHeight / video.videoHeight;
    const targetWidth = Math.min(854, Math.round((video.videoWidth * scale) / 2) * 2);

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d', { alpha: false });

    if (!ctx) {
        URL.revokeObjectURL(objectUrl);
        throw new Error("Не удалось создать контекст холста для фоллбека");
    }

    const stream = canvas.captureStream(25);
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : MediaRecorder.isTypeSupported('video/webm')
            ? 'video/webm'
            : 'video/mp4';

    const targetMaxBytes = 18.5 * 1024 * 1024;
    const calculatedBitrate = Math.max(450000, Math.floor((targetMaxBytes * 8) / duration));

    const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: calculatedBitrate,
    });

    const chunks: Blob[] = [];
    mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    return new Promise((resolve, reject) => {
        mediaRecorder.onstop = () => {
            URL.revokeObjectURL(objectUrl);
            const blob = new Blob(chunks, { type: mimeType });
            const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
            const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, `.${ext}`), { type: mimeType });
            if (onProgress) onProgress(100);
            resolve(compressedFile);
        };

        mediaRecorder.onerror = (err) => {
            URL.revokeObjectURL(objectUrl);
            reject(err);
        };

        mediaRecorder.start();
        video.play().catch(reject);

        const draw = () => {
            if (video.ended || video.paused || video.currentTime >= duration) {
                if (mediaRecorder.state === 'recording') {
                    mediaRecorder.stop();
                }
                return;
            }

            ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
            
            if (onProgress) {
                const percent = Math.min(99, (video.currentTime / duration) * 100);
                onProgress(Number(percent.toFixed(2)));
            }

            requestAnimationFrame(draw);
        };

        draw();
    });
}