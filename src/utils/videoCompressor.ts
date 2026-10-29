// src/utils/videoCompressor.ts
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import ffmpeg from 'fluent-ffmpeg';

// Безопасное подключение ffmpeg-static, обходящее статичную упаковку Next.js / Webpack
try {
    const dynamicRequire = eval("require");
    const ffmpegStatic = dynamicRequire("ffmpeg-static");
    if (ffmpegStatic) {
        ffmpeg.setFfmpegPath(ffmpegStatic);
    }
} catch {
    // Если на продакшене пакет не найден, FFmpeg возьмется из системного PATH (Linux)
    ffmpeg.setFfmpegPath("ffmpeg");
}

interface CompressResult {
    success: boolean;
    buffer?: Buffer;
    error?: string;
}

/**
 * Сжимает видеофайл до целевого размера ~19.5 МБ с сохранением качества и звука 128k
 */
export async function compressVideoBuffer(
    videoBuffer: Buffer,
    fileName: string
): Promise<CompressResult> {
    const sizeInMB = videoBuffer.length / (1024 * 1024);

    // Если файл уже меньше 19 МБ, сжимать нет смысла — возвращаем оригинал
    if (sizeInMB <= 19) {
        return { success: true, buffer: videoBuffer };
    }

    console.log(`[VIDEO COMPRESSION] Файл ${fileName} весит ${sizeInMB.toFixed(2)} МБ (> 19 МБ). Запуск двухпроходного сжатия...`);

    const tempDir = os.tmpdir();
    const uniqueId = Date.now();
    const safeName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
    const inputPath = path.join(tempDir, `input_${uniqueId}_${safeName}`);
    const outputPath = path.join(tempDir, `output_${uniqueId}.mp4`);
    const logPath = path.join(tempDir, `ffmpeg2pass_${uniqueId}.log`);

    try {
        await fs.writeFile(inputPath, videoBuffer);

        // Получаем длительность видео через ffprobe
        const duration = await new Promise<number>((resolve, reject) => {
            ffmpeg.ffprobe(inputPath, (err, metadata) => {
                if (err || !metadata.format || !metadata.format.duration) {
                    reject(new Error("Не удалось определить длительность видео"));
                } else {
                    resolve(metadata.format.duration);
                }
            });
        });

        // Расчет битрейта для стабильных 19-19.5 МБ на выходе
        const targetSizeMB = 19.8;
        const totalBits = targetSizeMB * 1024 * 1024 * 8;
        const audioBitrateKbps = 128; // Качественный звук
        const audioBits = audioBitrateKbps * 1000 * duration;
        
        let videoBitrateKbps = Math.floor((totalBits - audioBits) / duration / 1000);
        if (videoBitrateKbps < 400) videoBitrateKbps = 400;
        const videoBitrateStr = `${videoBitrateKbps}k`;

        // 1-й проход (анализ)
        await new Promise<void>((resolve, reject) => {
            ffmpeg(inputPath)
                .outputOptions([
                    "-c:v libx264",
                    `-b:v ${videoBitrateStr}`,
                    "-pass 1",
                    "-an",
                    "-f null"
                ])
                .output(logPath)
                .on('end', () => resolve())
                .on('error', (err) => reject(err))
                .run();
        });

        // 2-й проход (финальная кодировка)
        await new Promise<void>((resolve, reject) => {
            ffmpeg(inputPath)
                .outputOptions([
                    "-c:v libx264",
                    `-b:v ${videoBitrateStr}`,
                    "-pass 2",
                    "-preset slow",
                    "-c:a aac",
                    `-b:a ${audioBitrateKbps}k`,
                    "-pix_fmt yuv420p",
                    "-movflags +faststart",
                    `-passlogfile ${logPath}`
                ])
                .output(outputPath)
                .on('end', () => resolve())
                .on('error', (err) => reject(err))
                .run();
        });

        // Читаем результат сжатия
        const compressedBuffer = await fs.readFile(outputPath);
        
        // Очистка временных файлов
        await fs.unlink(inputPath).catch(() => {});
        await fs.unlink(outputPath).catch(() => {});
        await fs.unlink(logPath).catch(() => {});

        if (compressedBuffer.length < videoBuffer.length) {
            console.log(`[VIDEO COMPRESSION SUCCESS] Файл сжат: ${sizeInMB.toFixed(2)} МБ -> ${(compressedBuffer.length / (1024 * 1024)).toFixed(2)} МБ`);
            return { success: true, buffer: compressedBuffer };
        }

        return { success: true, buffer: videoBuffer };

    } catch (err: any) {
        // Очистка при ошибке
        await fs.unlink(inputPath).catch(() => {});
        await fs.unlink(outputPath).catch(() => {});
        await fs.unlink(logPath).catch(() => {});

        console.error("[VIDEO COMPRESSION ERROR]:", err);
        return { success: false, error: err.message || "Ошибка сжатия видео" };
    }
}