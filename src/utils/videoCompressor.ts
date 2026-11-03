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

export async function compressVideoOnClient(
    file: File,
    onProgress?: (progress: number) => void
): Promise<File> {
    if (!file || !(file instanceof Blob)) {
        throw new Error("В функцию сжатия не передан объект файла (File/Blob)");
    }

    const MAX_SIZE_BYTES = 19.5 * 1024 * 1024; // Лимит Telegram (~19.5 Мб)

    if (file.size <= MAX_SIZE_BYTES) {
        console.log(`✅ Размер файла ${(file.size / (1024 * 1024)).toFixed(2)} MB уже в норме. Пропускаем сжатие.`);
        return file;
    }

    console.log("🧠 Старт оптимизированного сжатия (480p под лимит 19.5MB):", {
        name: file.name,
        sizeMB: (file.size / (1024 * 1024)).toFixed(2) + " MB"
    });

    const ff = await getFFmpegInstance();

    const inputName = 'input_source_video';
    const outputName = 'output_compressed.mp4';

    await ff.writeFile(inputName, await fetchFile(file));

    let currentPercent = 0;
    let isFinished = false;

    // Автономный независимый таймер: плавно идет вперед до 99%, никогда не откатывается назад
    const progressInterval = setInterval(() => {
        if (isFinished) return;

        if (currentPercent < 95.0) {
            currentPercent += 0.35; // Уверенный шаг
        } else if (currentPercent < 99.0) {
            currentPercent += 0.05; // Плавное замедление на финише
        }

        if (onProgress) {
            onProgress(Number(Math.min(99.0, currentPercent).toFixed(2)));
        }
    }, 150);

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
            '-c:a', 'aac',         // Жесткое перекодирование звука исключает зависания таймстампов
            '-b:a', '128k',
            '-movflags', '+faststart',
            outputName
        ]);
    } finally {
        isFinished = true;
        clearInterval(progressInterval);
        if (onProgress) {
            onProgress(100);
        }
    }

    const data = await ff.readFile(outputName);
    const uint8Array = new Uint8Array(data as any);
    const resultBlob = new Blob([uint8Array], { type: 'video/mp4' });
    
    const newFileName = file.name.replace(/\.[^/.]+$/, '') + '.mp4';
    const compressedFile = new File([resultBlob], newFileName, { type: 'video/mp4' });
    
    console.log(`📦 Готово! Итоговый размер: ${(compressedFile.size / (1024 * 1024)).toFixed(2)} MB`);

    try {
        await ff.deleteFile(inputName);
        await ff.deleteFile(outputName);
    } catch (e) {}

    return compressedFile;
}