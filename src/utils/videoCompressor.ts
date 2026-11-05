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

    console.log("🚀 Запуск аппаратного сжатия через WebCodecs API (GPU)...");

    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;

    const objectUrl = URL.createObjectURL(file);
    video.src = objectUrl;

    await new Promise((resolve, reject) => {
        video.onloadedmetadata = () => resolve(true);
        video.onerror = () => reject(new Error("Ошибка загрузки видео для WebCodecs"));
    });

    const duration = video.duration || 1;
    const targetHeight = 480; // Надежные 480p для ПК и мобилок
    const scale = targetHeight / video.videoHeight;
    const targetWidth = Math.round((video.videoWidth * scale) / 2) * 2; // Должно делиться на 2 для кодека

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });

    if (!ctx) {
        URL.revokeObjectURL(objectUrl);
        throw new Error("Не удалось создать 2D контекст холста");
    }

    // Расчет битрейта под целевые ~18.5 МБ
    const targetMaxBytes = 18.5 * 1024 * 1024;
    const totalTargetBits = targetMaxBytes * 8;
    const audioBitrate = 128 * 1000;
    const availableVideoBits = totalTargetBits - (audioBitrate * duration);
    const calculatedVideoBitrate = Math.max(600000, Math.floor(availableVideoBits / duration));

    // Инициализация WebM Мьюксера без лишних параметров типов
    const muxer = new Muxer({
        target: new ArrayBufferTarget(),
        video: {
            codec: 'V_VP9',
            width: targetWidth,
            height: targetHeight,
            frameRate: 30,
        },
    });

    let encodedVideoChunks = 0;
    const totalEstimatedFrames = Math.floor(duration * 30);

    // Настройка аппаратного кодера VideoEncoder
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

    const isSupported = await VideoEncoder.isConfigSupported({
        codec: 'vp09.00.10.08', // VP9 профиль
        width: targetWidth,
        height: targetHeight,
        bitrate: calculatedVideoBitrate,
        framerate: 30,
        hardwareAcceleration: 'prefer-hardware', // Приоритет GPU
    });

    if (!isSupported.supported) {
        URL.revokeObjectURL(objectUrl);
        throw new Error("Аппаратный кодек VP9 не поддерживается вашим браузером");
    }

    videoEncoder.configure({
        codec: 'vp09.00.10.08',
        width: targetWidth,
        height: targetHeight,
        bitrate: calculatedVideoBitrate,
        framerate: 30,
        hardwareAcceleration: 'prefer-hardware',
    });

    // Построчный обход видео и скармливание кадров кодеру
    const fps = 30;
    const interval = 1 / fps;
    let currentTime = 0;

    video.currentTime = 0;

    while (currentTime < duration) {
        video.currentTime = currentTime;
        await new Promise((r) => {
            video.onseeked = r;
            setTimeout(r, 100); // Защита от зависания seek
        });

        ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
        
        const timestampMicroseconds = Math.round(currentTime * 1_000_000);
        const frame = new VideoFrame(canvas, { timestamp: timestampMicroseconds });
        
        // Ключевой кадр каждые 2 секунды (60 кадров) для стабильности
        const keyFrame = encodedVideoChunks % 60 === 0;
        
        videoEncoder.encode(frame, { keyFrame });
        frame.close();

        currentTime += interval;
    }

    await videoEncoder.flush();
    muxer.finalize();

    URL.revokeObjectURL(objectUrl);

    const buffer = muxer.target.buffer;
    const resultBlob = new Blob([buffer], { type: 'video/webm' });
    const newFileName = file.name.replace(/\.[^/.]+$/, '') + '.webm';
    const compressedFile = new File([resultBlob], newFileName, { type: 'video/webm' });

    console.log(`📦 WebCodecs сжатие завершено. Итоговый размер: ${(compressedFile.size / (1024 * 1024)).toFixed(2)} MB`);

    if (onProgress) {
        onProgress(100);
    }

    return compressedFile;
}