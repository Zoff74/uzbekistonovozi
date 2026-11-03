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

    let currentPercent = 0.0000;
    let isFinished = false;

    // Живой таймер прогресса с гарантированным движением хвоста без замираний
    const progressInterval = setInterval(() => {
        if (isFinished) return;

        if (currentPercent < 99.0) {
            // Плавный рост с гарантированным минимальным шагом, чтобы хвост никогда не останавливался
            const remaining = 99.0 - currentPercent;
            const increment = Math.max(remaining * 0.015, 0.0015);
            currentPercent += increment;
        } else {
            // Если дошли до 99%, но FFmpeg еще думает, держим живой плавающий хвост около 99.2%
            currentPercent = 99.0 + (Math.sin(Date.now() / 200) * 0.2);
        }

        if (onProgress) {
            onProgress(Number(currentPercent.toFixed(4)));
        }
    }, 40);

    try {
        await ff.exec([
            '-i', inputName,
            '-c:v', 'libx264',
            '-preset', 'ultrafast',   // Максимальная скорость транскодирования в браузере
            '-threads', '0',          // Задействуем все доступные ядра процессора
            '-b:v', '400k',           // Жесткий целевой битрейт видео под длинные ролики (~5 мин)
            '-maxrate', '600k',       // Пиковый запас битрейта для сложных моментов
            '-bufsize', '1200k',
            // Фильтры: стабильные 30 FPS (без рывков) + чистые 480p (идеально для лимита 19.5МБ без кубиков)
            '-vf', 'fps=30,scale=-2:480', 
            '-c:a', 'copy',           // Звук один-в-один без потерь времени и качества
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