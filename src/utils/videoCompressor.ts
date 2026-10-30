import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import os from "os";
import fs from "fs/promises";

const execAsync = promisify(exec);

const MAX_ALLOWED_SIZE_BYTES = 20 * 1024 * 1024; // 20 МБ

/**
 * Функция для получения длительности видео в секундах через ffprobe
 */
async function getVideoDuration(filePath: string): Promise<number> {
    try {
        const { stdout } = await execAsync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`);
        const duration = parseFloat(stdout.trim());
        return isNaN(duration) || duration <= 0 ? 180 : duration;
    } catch {
        return 180;
    }
}

/**
 * Сжатие видео через буфер. Если файл меньше 20 МБ — НЕ ТРОГАЕМ И ОСТАВЛЯЕМ ОРИГИНАЛ!
 */
export async function compressVideoBuffer(
    videoBuffer: Buffer, 
    originalName: string
): Promise<{ success: boolean; buffer?: Buffer; error?: string }> {
    // 1. ПРОВЕРКА: Если оригинал меньше 20 МБ, возвращаем как есть без сжатия
    if (videoBuffer.length <= MAX_ALLOWED_SIZE_BYTES) {
        console.log(`[FFMPEG BUFFER] Файл меньше 20 МБ (${(videoBuffer.length / (1024 * 1024)).toFixed(2)} МБ). Пропускаем сжатие.`);
        return { success: true, buffer: videoBuffer };
    }

    const tempDir = os.tmpdir();
    const uniqueId = Date.now();
    const safeName = originalName.replace(/[^a-zA-Z0-9.-]/g, "_");
    const inputPath = path.join(tempDir, `in_${uniqueId}_${safeName}`);
    const outputPath = path.join(tempDir, `out_${uniqueId}.mp4`);

    try {
        console.log(`[FFMPEG BUFFER->DISK] Старт сжатия для: ${originalName} (${(videoBuffer.length / (1024 * 1024)).toFixed(2)} МБ)`);
        await fs.writeFile(inputPath, videoBuffer);

        const durationSec = await getVideoDuration(inputPath);
        
        const targetAudioBits = 96 * 1024 * durationSec;
        const targetVideoBits = 19 * 1024 * 1024 * 8 - targetAudioBits;
        
        let calculatedVideoBitrateKbps = Math.floor((targetVideoBits / durationSec) / 1000);
        if (calculatedVideoBitrateKbps < 300) calculatedVideoBitrateKbps = 300;
        if (calculatedVideoBitrateKbps > 3000) calculatedVideoBitrateKbps = 3000;

        const videoBitrateStr = `${calculatedVideoBitrateKbps}k`;
        const bufSizeStr = `${calculatedVideoBitrateKbps * 2}k`;

        console.log(`[FFMPEG] Длительность: ${durationSec.toFixed(1)}с. Расчетный битрейт видео: ${videoBitrateStr}`);

        const cmd = `ffmpeg -y -i "${inputPath}" -map 0:v:0 -map 0:a? -vf "scale='min(1280,iw)':-2" -vcodec libx264 -b:v ${videoBitrateStr} -maxrate ${videoBitrateStr} -bufsize ${bufSizeStr} -preset fast -acodec aac -b:a 96k -pix_fmt yuv420p -movflags +faststart "${outputPath}"`;
        
        await execAsync(cmd, { maxBuffer: 1024 * 1024 * 50 });

        const compressedBuffer = await fs.readFile(outputPath);
        const finalSizeMB = compressedBuffer.length / (1024 * 1024);
        console.log(`[FFMPEG BUFFER->DISK] Успешно! Итоговый вес: ${finalSizeMB.toFixed(2)} МБ`);

        await fs.unlink(inputPath).catch(() => {});
        await fs.unlink(outputPath).catch(() => {});

        return { success: true, buffer: compressedBuffer };

    } catch (error: any) {
        await fs.unlink(inputPath).catch(() => {});
        await fs.unlink(outputPath).catch(() => {});
        console.error(`[FFMPEG ERROR]:`, error);
        return { success: false, error: error.message || "Ошибка сжатия видео на сервере" };
    }
}

/**
 * Чистое сжатие по путям на диске. Если файл меньше 20 МБ — копировать/не трогать!
 */
export async function compressVideoPath(
    inputPath: string, 
    outputPath: string, 
    originalName: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const stats = await fs.stat(inputPath);
        
        // 1. ПРОВЕРКА: Если оригинал меньше 20 МБ, просто копируем его на outputPath (или оставляем как есть)
        if (stats.size <= MAX_ALLOWED_SIZE_BYTES) {
            console.log(`[FFMPEG PATH] Файл меньше 20 МБ (${(stats.size / (1024 * 1024)).toFixed(2)} МБ). Пропускаем сжатие.`);
            if (inputPath !== outputPath) {
                await fs.copyFile(inputPath, outputPath);
            }
            return { success: true };
        }

        console.log(`[FFMPEG PATH] Старт сжатия с диска для: ${originalName}`);

        const durationSec = await getVideoDuration(inputPath);
        
        const targetAudioBits = 96 * 1024 * durationSec;
        const targetVideoBits = 19 * 1024 * 1024 * 8 - targetAudioBits;
        
        let calculatedVideoBitrateKbps = Math.floor((targetVideoBits / durationSec) / 1000);
        if (calculatedVideoBitrateKbps < 300) calculatedVideoBitrateKbps = 300;
        if (calculatedVideoBitrateKbps > 3000) calculatedVideoBitrateKbps = 3000;

        const videoBitrateStr = `${calculatedVideoBitrateKbps}k`;
        const bufSizeStr = `${calculatedVideoBitrateKbps * 2}k`;

        console.log(`[FFMPEG] Длительность: ${durationSec.toFixed(1)}с. Расчетный битрейт видео: ${videoBitrateStr}`);

        const cmd = `ffmpeg -y -i "${inputPath}" -map 0:v:0 -map 0:a? -vf "scale='min(1280,iw)':-2" -vcodec libx264 -b:v ${videoBitrateStr} -maxrate ${videoBitrateStr} -bufsize ${bufSizeStr} -preset fast -acodec aac -b:a 96k -pix_fmt yuv420p -movflags +faststart "${outputPath}"`;
        
        await execAsync(cmd, { maxBuffer: 1024 * 1024 * 50 });

        const finalStats = await fs.stat(outputPath);
        console.log(`[FFMPEG PATH] Успешно! Вес: ${(finalStats.size / (1024 * 1024)).toFixed(2)} МБ`);

        return { success: true };
    } catch (error: any) {
        console.error(`[FFMPEG PATH ERROR]:`, error);
        return { success: false, error: error.message || "Ошибка сжатия видео" };
    }
}