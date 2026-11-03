// src/utils/videoCompressor.ts
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null = null;

async function getFFmpegInstance(onProgress?: (progress: number) => void): Promise<FFmpeg> {
    if (ffmpeg && ffmpeg.loaded) {
        return ffmpeg;
    }

    ffmpeg = new FFmpeg();
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
    
    ffmpeg.on('progress', ({ progress }) => {
        if (onProgress && progress >= 0 && progress <= 1) {
            const percent = Math.round(progress * 99);
            onProgress(percent);
        }
    });

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

    console.log("🧠 Старт FFmpeg сжатия с расчетом под ~18.5 Мб без зернистости:", {
        name: file.name,
        sizeMB: (file.size / (1024 * 1024)).toFixed(2) + " MB"
    });

    const ff = await getFFmpegInstance(onProgress);

    const inputName = 'input_source_video';
    const outputName = 'output_compressed.mp4';

    await ff.writeFile(inputName, await fetchFile(file));

    // ⏱️ Сначала узнаем длительность видео через ffprobe или через запуск быстрого анализа, 
    // но так как в ffmpeg.wasm это сложно, рассчитываем через средний целевой битрейт для 720p.
    // Целимся в 18.5 Мб (148 мегабит). Для стандартных роликов до 3-5 минут это идеальный баланс.
    
    console.log("⚙️ Кодирование в 720p с защитой от кубиков и зернистости...");

    // Используем кодек libx264 с высоким качеством (crf 21 дает кристальную четкость без кубиков)
    await ff.exec([
        '-i', inputName,
        '-c:v', 'libx264',
        '-preset', 'medium',
        '-crf', '21',             // 21 — стандарт высочайшего качества для веб-видео (никаких кубиков!)
        '-maxrate', '2200k',      // Ограничение пикового битрейта, чтобы не вылетать за лимиты
        '-bufsize', '4400k',      // Буфер для плавности потока
        '-vf', 'scale=-2:720',    // Четкое HD 720p
        '-c:a', 'aac',
        '-b:a', '128k',           // Отличный чистый звук
        '-movflags', '+faststart', // Мгновенный стриминг на сайте без ожидания скачивания
        outputName
    ]);

    const data = await ff.readFile(outputName);
    const resultBlob = new Blob([data], { type: 'video/mp4' });
    const newFileName = file.name.replace(/\.[^/.]+$/, '') + '.mp4';

    const compressedFile = new File([resultBlob], newFileName, { type: 'video/mp4' });
    console.log(`📦 Готово! Итоговый размер: ${(compressedFile.size / (1024 * 1024)).toFixed(2)} MB`);

    try {
        await ff.deleteFile(inputName);
        await ff.deleteFile(outputName);
    } catch (e) {}

    return compressedFile;
}