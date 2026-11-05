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

    // Проверяем поддержку WebCodecs API
    const hasWebCodecs = typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';

    if (hasWebCodecs) {
        try {
            const targetHeight = 480;
            const testBitrate = 800000;
            const isSupported = await VideoEncoder.isConfigSupported({
                codec: 'vp09.00.10.08',
                width: targetHeight,
                height: targetHeight,
                bitrate: testBitrate,
                framerate: 30,
                hardwareAcceleration: 'prefer-hardware',
            }).catch(() => ({ supported: false }));

            if (isSupported.supported) {
                console.log("🚀 Запуск аппаратного сжатия через WebCodecs API (GPU)...");
                return await compressWithWebCodecsEngine(file, onProgress);
            }
        } catch (e) {
            console.warn("⚠️ WebCodecs не удалось инициализировать, переключаемся на универсальный метод:", e);
        }
    }

    // ФОЛЛБЕК ДЛЯ СТАРЫХ УСТРОЙСТВ И БРАУЗЕРОВ (MediaRecorder + Canvas)
    console.log("🔄 Запуск универсального сжатия через MediaRecorder (поддерживается на вашем устройстве)...");
    return await compressWithMediaRecorderFallback(file, onProgress);
}

// Движок 1: WebCodecs (современные браузеры с поддержкой GPU)
async function compressWithWebCodecsEngine(file: File, onProgress?: (progress: number) => void): Promise<File> {
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
    const targetWidth = Math.round((video.videoWidth * scale) / 2) * 2;

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });

    if (!ctx) {
        URL.revokeObjectURL(objectUrl);
        throw new Error("Не удалось создать 2D контекст холста");
    }

    const targetMaxBytes = 18.5 * 1024 * 1024;
    const totalTargetBits = targetMaxBytes * 8;
    const audioBitrate = 128 * 1000;
    const availableVideoBits = totalTargetBits - (audioBitrate * duration);
    const finalVideoBitrate = Math.max(600000, Math.floor(availableVideoBits / duration));

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
        framerate: 30,
        hardwareAcceleration: 'prefer-hardware',
    });

    const fps = 30;
    const interval = 1 / fps;
    let currentTime = 0;

    video.currentTime = 0;

    while (currentTime < duration) {
        video.currentTime = currentTime;
        await new Promise((r) => {
            video.onseeked = r;
            setTimeout(r, 100);
        });

        ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
        const timestampMicroseconds = Math.round(currentTime * 1_000_000);
        const frame = new VideoFrame(canvas, { timestamp: timestampMicroseconds });
        
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
    const compressedFile = new File([resultBlob], file.name.replace(/\.[^/.]+$/, '') + '.webm', { type: 'video/webm' });

    if (onProgress) onProgress(100);
    return compressedFile;
}

// Движок 2: Универсальный MediaRecorder (работает везде, где нет WebCodecs)
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
    const targetWidth = Math.round((video.videoWidth * scale) / 2) * 2;

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d', { alpha: false });

    if (!ctx) {
        URL.revokeObjectURL(objectUrl);
        throw new Error("Не удалось создать контекст холста для фоллбека");
    }

    const stream = canvas.captureStream(30);
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : MediaRecorder.isTypeSupported('video/webm')
            ? 'video/webm'
            : 'video/mp4';

    const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 800000, // 800 kbps для сжатия под лимит
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