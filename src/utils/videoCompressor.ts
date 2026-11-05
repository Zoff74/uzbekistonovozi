// src/utils/videoCompressor.ts
import { Muxer, ArrayBufferTarget } from 'webm-muxer';

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
            const targetHeight = 480;
            const targetWidth = 854;
            const isSupported = await VideoEncoder.isConfigSupported({
                codec: 'vp09.00.10.08',
                width: targetWidth,
                height: targetHeight,
                bitrate: 450000,
                framerate: 25,
                hardwareAcceleration: 'prefer-hardware',
            }).catch(() => ({ supported: false }));

            if (isSupported.supported) {
                console.log("🚀 Запуск нативного потокового сжатия (WebCodecs GPU)...");
                return await compressWithWebCodecsEngine(file, onProgress);
            }
        } catch (e) {
            console.warn("⚠️ WebCodecs не удалось инициализировать, переключаемся на MediaRecorder:", e);
        }
    }

    console.log("🔄 Запуск универсального сжатия через MediaRecorder...");
    return await compressWithMediaRecorderFallback(file, onProgress);
}

// Движок 1: Нативный потоковый WebCodecs через плавное воспроизведение
async function compressWithWebCodecsEngine(file: File, onProgress?: (progress: number) => void): Promise<File> {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true; // Обязательно для фонового автоплея
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
    const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });

    if (!ctx) {
        URL.revokeObjectURL(objectUrl);
        throw new Error("Не удалось создать 2D контекст холста");
    }

    // Расчет битрейта по нашему YouTube-эталону
    const targetMaxBytes = 18.5 * 1024 * 1024;
    const totalTargetBits = targetMaxBytes * 8;
    const audioBitrate = 64 * 1000; 
    const availableVideoBits = totalTargetBits - (audioBitrate * duration);
    const finalVideoBitrate = Math.max(400000, Math.min(900000, Math.floor(availableVideoBits / duration)));
    
    console.log(`📊 Эталонный битрейт видео: ${(finalVideoBitrate / 1000).toFixed(0)} kbps (длительность: ${duration.toFixed(1)}с)`);

    const muxer = new Muxer({
        target: new ArrayBufferTarget(),
        video: {
            codec: 'V_VP9',
            width: targetWidth,
            height: targetHeight,
            frameRate: 25,
        },
    });

    let encodedVideoChunks = 0;
    const fps = 25;
    const totalEstimatedFrames = Math.floor(duration * fps);

    const videoEncoder = new VideoEncoder({
        output: (chunk, metadata) => {
            muxer.addVideoChunk(chunk, metadata);
            encodedVideoChunks++;
            if (onProgress && totalEstimatedFrames > 0) {
                const percent = Math.min(99, (encodedVideoChunks / totalEstimatedFrames) * 100);
                onProgress(Number(percent.toFixed(2)));
            }
        },
        error: (e) => console.error("❌ Ошибка VideoEncoder:", e),
    });

    videoEncoder.configure({
        codec: 'vp09.00.10.08',
        width: targetWidth,
        height: targetHeight,
        bitrate: finalVideoBitrate,
        framerate: fps,
        hardwareAcceleration: 'prefer-hardware',
    });

    // Запускаем естественное воспроизведение видео
    await video.play().catch((err) => {
        throw new Error("Не удалось запустить воспроизведение видео для сжатия: " + err.message);
    });

    return new Promise((resolve, reject) => {
        let lastProcessedTime = -1;
        const frameInterval = 1 / fps;

        const renderLoop = async () => {
            try {
                if (video.ended || video.paused || video.currentTime >= duration) {
                    video.pause();
                    await videoEncoder.flush();
                    muxer.finalize();
                    URL.revokeObjectURL(objectUrl);

                    const buffer = muxer.target.buffer;
                    const resultBlob = new Blob([buffer], { type: 'video/webm' });
                    const compressedFile = new File([resultBlob], file.name.replace(/\.[^/.]+$/, '') + '.webm', { type: 'video/webm' });

                    console.log(`📦 Нативное сжатие завершено. Итоговый размер: ${(compressedFile.size / (1024 * 1024)).toFixed(2)} MB`);
                    if (onProgress) onProgress(100);
                    resolve(compressedFile);
                    return;
                }

                // Захватываем кадр строго по шагу частоты кадров (25 FPS)
                if (video.currentTime - lastProcessedTime >= frameInterval) {
                    lastProcessedTime = video.currentTime;

                    ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
                    const timestampMicroseconds = Math.round(video.currentTime * 1_000_000);
                    const frame = new VideoFrame(canvas, { timestamp: timestampMicroseconds });
                    
                    const keyFrame = encodedVideoChunks % 50 === 0;
                    videoEncoder.encode(frame, { keyFrame });
                    frame.close();
                }

                requestAnimationFrame(renderLoop);
            } catch (err) {
                video.pause();
                URL.revokeObjectURL(objectUrl);
                reject(err);
            }
        };

        renderLoop();
    });
}

// Движок 2: Потоковый MediaRecorder фоллбек
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