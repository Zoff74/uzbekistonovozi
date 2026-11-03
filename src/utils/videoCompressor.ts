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

    console.log("🧠 Старт FFmpeg сжатия с ультра-плавным микропроцентным счетчиком:", {
        name: file.name,
        sizeMB: (file.size / (1024 * 1024)).toFixed(2) + " MB"
    });

    const ff = await getFFmpegInstance();

    const inputName = 'input_source_video';
    const outputName = 'output_compressed.mp4';

    await ff.writeFile(inputName, await fetchFile(file));

    // 🔥 Сверхчастый таймер (каждые 40мс) для тех самых микропроцентов (1.8120, 1.8121...)
    let currentPercent = 0.0000;
    let isFinished = false;

    const progressInterval = setInterval(() => {
        if (isFinished) return;
        
        // Плавный прирост с математическим затуханием к 99%
        if (currentPercent < 98.5) {
            const remaining = 99 - currentPercent;
            const increment = Math.max(remaining * 0.015, 0.0012);
            currentPercent += increment;
            
            if (onProgress) {
                onProgress(Number(currentPercent.toFixed(4)));
            }
        }
    }, 40); // 40мс обновление дает абсолютно плавный бег цифр на экране

    try {
        await ff.exec([
            '-i', inputName,
            '-c:v', 'libx264',
            '-preset', 'ultrafast',   // Максимальная скорость WebAssembly
            '-threads', '0',          // Автоматически задействовать все ядра процессора для ускорения
            '-crf', '23',             // Баланс качества без кубиков
            '-maxrate', '2200k',      // Лимит битрейта для Telegram
            '-bufsize', '4400k',
            '-vf', 'scale=-2:720',    // HD 720p для гитары
            '-c:a', 'aac',
            '-b:a', '128k',
            '-movflags', '+faststart',
            outputName
        ]);
    } finally {
        isFinished = true;
        clearInterval(progressInterval);
        if (onProgress) {
            onProgress(100); // Четкие 100% по завершении
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