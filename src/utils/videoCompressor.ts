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

    // 1. Узнаем точную длительность видео
    const duration = await getVideoDuration(file);
    if (!duration || duration <= 0) {
        throw new Error("Не удалось определить длительность видеофайла");
    }

    // 2. Расчет оптимального битрейта под 19 МБ для однопроходного кодирования
    const TARGET_SIZE_BITS = 19 * 1024 * 1024 * 8;
    const audioBits = duration * 128000;
    const videoBits = TARGET_SIZE_BITS - audioBits;
    
    const calculatedVideoBitrateKbps = Math.max(200, Math.floor((videoBits / duration) / 1000));
    
    const videoBitrateStr = `${calculatedVideoBitrateKbps}k`;
    const maxRateStr = `${Math.floor(calculatedVideoBitrateKbps * 1.4)}k`;
    const bufSizeStr = `${calculatedVideoBitrateKbps * 2}k`;

    const ff = await getFFmpegInstance();

    const inputName = 'input_source_video';
    const outputName = 'output_compressed.mp4';

    try {
        await ff.deleteFile(inputName);
        await ff.deleteFile(outputName);
    } catch {}

    await ff.writeFile(inputName, await fetchFile(file));

    if (onProgress) {
        onProgress(0);
    }

    const progressCallback = ({ progress }: { progress: number }) => {
        let percent = progress * 100;
        if (isNaN(percent) || percent < 0) {
            percent = 0;
        }
        const clamped = Math.min(99.9, Math.max(0, percent));
        if (onProgress) {
            onProgress(Number(clamped.toFixed(2)));
        }
    };

    ff.on('progress', progressCallback);

    try {
        // Однопроходное кодирование (мгновенно и без зависаний в WASM) с жестким удержанием битрейта и 480p
        await ff.exec([
            '-i', inputName,
            '-c:v', 'libx264',
            '-preset', 'veryfast',     // Оптимальный баланс скорости и качества для браузера
            '-b:v', videoBitrateStr,
            '-maxrate', maxRateStr,
            '-bufsize', bufSizeStr,
            // Ограничение до 480p (золотая середина), если исходник больше
            '-vf', "fps=30,scale='if(gt(ih,480),-2,iw)':'if(gt(ih,480),480,trunc(ih/2)*2)'",
            '-c:a', 'aac',
            '-b:a', '128k',
            '-movflags', '+faststart',
            outputName
        ]);
    } finally {
        ff.off('progress', progressCallback);
    }

    if (onProgress) {
        onProgress(100);
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