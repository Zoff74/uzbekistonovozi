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

// Вспомогательная функция для точного определения длительности видео в секундах
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

    const totalDuration = await getVideoDuration(file);
    console.log(`⏱️ Реальная длительность видео: ${totalDuration.toFixed(1)} сек.`);

    const ff = await getFFmpegInstance();

    const inputName = 'input_source_video';
    const outputName = 'output_compressed.mp4';

    await ff.writeFile(inputName, await fetchFile(file));

    // Подписываемся на НАСТОЯЩИЙ прогресс от FFmpeg
    let lastReportedPercent = 0;
    if (onProgress) {
        onProgress(0);
    }

    ff.on('progress', ({ time }) => {
        // time приходит в микросекундах или секундах (в зависимости от версии core, обычно в секундах или микросекундах)
        // В @ffmpeg/core 0.12.6 'time' измеряется в микросекундах (или секундах? Проверим: делим на 1000000 если микросекунды, но безопаснее конвертировать)
        // На всякий случай: если time слишком большое число, это микросекунды.
        let currentTimeSec = time > 10000 ? time / 1000000 : time;

        if (totalDuration > 0) {
            let percent = (currentTimeSec / totalDuration) * 100;
            // Ограничиваем в пределах 0 - 99.5%, чтобы 100% отдать только по факту завершения
            percent = Math.min(99.5, Math.max(0, percent));
            
            // Гарантируем, что прогресс идет только вперед
            if (percent > lastReportedPercent) {
                lastReportedPercent = percent;
                if (onProgress) {
                    onProgress(Number(percent.toFixed(3)));
                }
            }
        }
    });

    // Страховочный микро-таймер на случай, если FFmpeg по какой-то причине не прислал событие progress,
    // но он будет ползти ОЧЕНЬ медленно и плавно, подстраиваясь под реальное время (например, рассчитывая на 3-5 минут работы)
    let fallbackProgress = 0;
    const fallbackInterval = setInterval(() => {
        if (fallbackProgress < 95.0 && fallbackProgress <= lastReportedPercent) {
            fallbackProgress += 0.05; // Медленный, честный прирост
            if (fallbackProgress > lastReportedPercent) {
                lastReportedPercent = fallbackProgress;
                if (onProgress) {
                    onProgress(Number(fallbackProgress.toFixed(3)));
                }
            }
        }
    }, 1000); // Раз в секунду, а не каждые 40мс

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
            '-c:a', 'copy',
            '-movflags', '+faststart',
            outputName
        ]);
    } finally {
        clearInterval(fallbackInterval);
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