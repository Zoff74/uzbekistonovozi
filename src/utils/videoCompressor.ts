// src/utils/videoCompressor.ts
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null = null;

async function getFFmpegInstance(): Promise<FFmpeg> {
    if (ffmpeg && ffmpeg.loaded) {
        return ffmpeg;
    }

    ffmpeg = new FFmpeg();
    
    ffmpeg.on('log', () => {
        // Логирование отключено для максимальной производительности
    });

    // Стабильный однопоточный core, который работает везде без COOP/COEP заголовков
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

    const MAX_SIZE_BYTES = 19.5 * 1024 * 1024; // Строгий лимит Telegram (< 19.5MB)
    if (file.size <= MAX_SIZE_BYTES) {
        console.log(`✅ Размер файла ${(file.size / (1024 * 1024)).toFixed(2)} MB уже меньше лимита. Пропускаем сжатие.`);
        return file;
    }

    console.log("🧠 Старт быстрого FFmpeg WASM сжатия под лимит Telegram (<19.5Мб)...");

    const duration = await getVideoDuration(file);
    if (!duration || duration <= 0) {
        throw new Error("Не удалось определить длительность видеофайла");
    }

    // 🧮 Точный расчет под целевые 18.5 МБ с качественным звуком
    const targetMaxBytes = 18.5 * 1024 * 1024;
    const totalTargetBits = targetMaxBytes * 8;
    const audioBitrateKbps = 128; // 128 kbps для отличного звука
    const totalAudioBits = audioBitrateKbps * 1000 * duration;
    
    const availableVideoBits = totalTargetBits - totalAudioBits;
    const calculatedVideoBitrateKbps = Math.max(400, Math.floor((availableVideoBits / duration) / 1000));
    
    const videoBitrateStr = `${calculatedVideoBitrateKbps}k`;
    const maxRateStr = `${Math.floor(calculatedVideoBitrateKbps * 1.3)}k`;
    const bufSizeStr = `${calculatedVideoBitrateKbps * 2}k`;

    console.log(`📊 Длительность: ${duration.toFixed(1)}с | Расчетный видео-битрейт: ${videoBitrateStr}`);

    const ff = await getFFmpegInstance();

    const inputName = 'input_source_video.mp4';
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
        // Однопроходное сжатие на пресете ultrafast (максимальная скорость работы WASM) в надежные 480p
        await ff.exec([
            '-i', inputName,
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-b:v', videoBitrateStr,
            '-maxrate', maxRateStr,
            '-bufsize', bufSizeStr,
            '-vf', 'fps=30,scale=-2:480',
            '-c:a', 'aac',
            '-b:a', `${audioBitrateKbps}k`,
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

    console.log(`📦 Сжатие завершено. Итоговый размер: ${(compressedFile.size / (1024 * 1024)).toFixed(2)} MB`);

    try {
        await ff.deleteFile(inputName);
        await ff.deleteFile(outputName);
    } catch (e) {}

    return compressedFile;
}