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

    console.log("🧠 Старт FFmpeg сжатия с плавным прогрессом:", {
        name: file.name,
        sizeMB: (file.size / (1024 * 1024)).toFixed(2) + " MB"
    });

    const ff = await getFFmpegInstance();

    const inputName = 'input_source_video';
    const outputName = 'output_compressed.mp4';

    await ff.writeFile(inputName, await fetchFile(file));

    // ⏱️ Запускаем искусственный плавный таймер прогресса, 
    // который красиво и непрерывно крутит цифры перед глазами, пока FFmpeg кодирует файл
    let currentPercent = 0;
    let isFinished = false;

    const progressInterval = setInterval(() => {
        if (isFinished) return;
        // Плавное увеличение с замедлением к 98%
        if (currentPercent < 98) {
            const increment = (98 - currentPercent) * 0.05;
            currentPercent += Math.max(increment, 0.001);
            if (onProgress) {
                onProgress(Number(currentPercent.toFixed(4)));
            }
        }
    }, 150); // Обновление каждые 150мс для тех самых микропроцентов на экране

    try {
        await ff.exec([
            '-i', inputName,
            '-c:v', 'libx264',
            '-preset', 'ultrafast',   // Максимальная скорость для WebAssembly
            '-crf', '23',             // Баланс качества без зернистости и кубиков
            '-maxrate', '2200k',      // Лимит битрейта для Telegram
            '-bufsize', '4400k',
            '-vf', 'scale=-2:720',    // HD 720p для идеальной видимости струн на гитаре
            '-c:a', 'aac',
            '-b:a', '128k',
            '-movflags', '+faststart',
            outputName
        ]);
    } finally {
        isFinished = true;
        clearInterval(progressInterval);
        if (onProgress) {
            onProgress(100); // По завершении доводим до 100%
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