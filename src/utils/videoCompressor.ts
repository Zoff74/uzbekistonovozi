// src/utils/videoCompressor.ts
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null = null;

async function getFFmpegInstance(): Promise<FFmpeg> {
    if (ffmpeg && ffmpeg.loaded) {
        return ffmpeg;
    }

    ffmpeg = new FFmpeg();
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';

    await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });

    return ffmpeg;
}

async function getVideoDuration(file: File): Promise<number> {
    return new Promise((resolve) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        const url = URL.createObjectURL(file);
        video.onloadedmetadata = () => {
            URL.revokeObjectURL(url);
            resolve(video.duration || 0);
        };
        video.onerror = () => {
            URL.revokeObjectURL(url);
            resolve(0);
        };
        video.src = url;
    });
}

export async function compressVideoOnClient(
    file: File,
    onProgress?: (progress: number) => void
): Promise<File> {
    if (!file || !(file instanceof Blob)) {
        throw new Error("В функцию сжатия не передан объект файла");
    }

    const MAX_SIZE_BYTES = 19.5 * 1024 * 1024;
    if (file.size <= MAX_SIZE_BYTES) {
        return file;
    }

    const totalDuration = await getVideoDuration(file);
    const ff = await getFFmpegInstance();

    const inputName = 'input_source_video';
    const outputName = 'output_compressed.mp4';

    await ff.writeFile(inputName, await fetchFile(file));

    let realPercent = 0;
    let visualPercent = 0;
    let isFinished = false;

    if (onProgress) {
        onProgress(0);
    }

    // Слушаем реальный прогресс от FFmpeg
    ff.on('progress', ({ time }) => {
        if (isFinished) return;
        const currentTimeSec = time > 10000 ? time / 1000000 : time;
        if (totalDuration > 0) {
            let percent = (currentTimeSec / totalDuration) * 100;
            realPercent = Math.min(99.5, Math.max(0, percent));
        }
    });

    // Живой непрерывный цикл плавного движения шкалы
    const tickerInterval = setInterval(() => {
        if (isFinished) return;

        // Если реальный прогресс впереди — плавно тянемся к нему
        if (visualPercent < realPercent) {
            visualPercent += (realPercent - visualPercent) * 0.2;
        } else if (visualPercent < 99.4) {
            // Если FFmpeg притормозил (например, на финальном мультиксе), 
            // шкала ВСЕ РАВНО медленно и неотвратимо ползет дальше сама!
            visualPercent += 0.008; 
        }

        if (onProgress) {
            onProgress(Number(visualPercent.toFixed(4)));
        }
    }, 40);

    try {
        await ff.exec([
            '-i', inputName,
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-threads', '0',
            '-b:v', '400k',
            '-maxrate', '600k',
            '-bufsize', '1200k',
            '-vf', 'fps=30,scale=-2:480',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-movflags', '+faststart',
            outputName
        ]);
    } finally {
        isFinished = true;
        clearInterval(tickerInterval);
        if (onProgress) {
            onProgress(100);
        }
    }

    const data = await ff.readFile(outputName);
    const uint8Array = new Uint8Array(data as any);
    const resultBlob = new Blob([uint8Array], { type: 'video/mp4' });
    
    const newFileName = file.name.replace(/\.[^/.]+$/, '') + '.mp4';
    const compressedFile = new File([resultBlob], newFileName, { type: 'video/mp4' });

    try {
        await ff.deleteFile(inputName);
        await ff.deleteFile(outputName);
    } catch (e) {}

    return compressedFile;
}