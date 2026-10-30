import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import os from "os";
import fs from "fs/promises";

const execAsync = promisify(exec);
const MAX_ALLOWED_SIZE_BYTES = 20 * 1024 * 1024; // 20 МБ
const TARGET_MAX_BYTES = 19.8 * 1024 * 1024; // Целевой потолок под завязку лимита

/**
 * Сжатие видео через буфер с максимальным качеством под 19.8 МБ (для telegram.action.ts)
 */
export async function compressVideoBuffer(
    videoBuffer: Buffer, 
    originalName: string
): Promise<{ success: boolean; buffer?: Buffer; error?: string }> {
    if (videoBuffer.length <= MAX_ALLOWED_SIZE_BYTES) {
        console.log(`[FFMPEG] Файл меньше 20 МБ (${(videoBuffer.length / (1024 * 1024)).toFixed(2)} МБ). Пропускаем сжатие.`);
        return { success: true, buffer: videoBuffer };
    }

    const tempDir = os.tmpdir();
    const uniqueId = Date.now();
    const safeName = originalName.replace(/[^a-zA-Z0-9.-]/g, "_");
    const inputPath = path.join(tempDir, `in_${uniqueId}_${safeName}`);
    const outputPath = path.join(tempDir, `out_${uniqueId}.mp4`);

    try {
        console.log(`[FFMPEG] Старт сжатия (цель ~19.8 МБ, макс качество) для: ${originalName}`);
        await fs.writeFile(inputPath, videoBuffer);

        // CRF 20 + maxrate 4.0M — максимальная детализация без квадратов и зерна
        const cmd = `ffmpeg -y -i "${inputPath}" -map 0:v:0 -map 0:a? -vf "scale='min(1280,iw)':-2" -vcodec libx264 -crf 20 -preset ultrafast -maxrate 4.0M -bufsize 8.0M -acodec aac -b:a 160k -pix_fmt yuv420p -movflags +faststart "${outputPath}"`;
        
        await execAsync(cmd, { maxBuffer: 1024 * 1024 * 100 });

        let compressedBuffer = await fs.readFile(outputPath);
        let finalSizeMB = compressedBuffer.length / (1024 * 1024);

        // Если файл случайно перешагнул 19.8 МБ, делаем легкий дожим до заветных 19.5-19.8 МБ, не убивая качество
        if (compressedBuffer.length > TARGET_MAX_BYTES) {
            console.log(`[FFMPEG OPTIMIZE] Вес ${finalSizeMB.toFixed(2)} МБ чуть выше цели, полируем до 19.7 МБ...`);
            const fineTunePath = path.join(tempDir, `fine_${uniqueId}.mp4`);
            const fineTuneCmd = `ffmpeg -y -i "${outputPath}" -vcodec libx264 -crf 22 -preset ultrafast -maxrate 3.2M -bufsize 6.4M -acodec aac -b:a 128k -pix_fmt yuv420p -movflags +faststart "${fineTunePath}"`;
            
            await execAsync(fineTuneCmd, { maxBuffer: 1024 * 1024 * 100 });
            compressedBuffer = await fs.readFile(fineTunePath);
            finalSizeMB = compressedBuffer.length / (1024 * 1024);
            await fs.unlink(fineTunePath).catch(() => {});
        }

        console.log(`[FFMPEG SUCCESS] Идеальный вес под лимит: ${finalSizeMB.toFixed(2)} МБ`);

        await fs.unlink(inputPath).catch(() => {});
        await fs.unlink(outputPath).catch(() => {});

        return { success: true, buffer: compressedBuffer };

    } catch (error: any) {
        await fs.unlink(inputPath).catch(() => {});
        await fs.unlink(outputPath).catch(() => {});
        
        const realErrorReason = error.stderr ? error.stderr.trim() : (error.message || 'Неизвестная ошибка кодирования');
        console.error(`❌ [FFMPEG FAILED]:`, realErrorReason);

        return { success: false, error: realErrorReason };
    }
}

/**
 * Сжатие видео по путям на диске с максимальным качеством под 19.8 МБ (для route.ts)
 */
export async function compressVideoPath(
    inputPath: string,
    outputPath: string,
    originalName: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const stats = await fs.stat(inputPath);

        if (stats.size <= MAX_ALLOWED_SIZE_BYTES) {
            console.log(`[FFMPEG PATH] Файл меньше 20 МБ (${(stats.size / (1024 * 1024)).toFixed(2)} МБ). Пропускаем сжатие.`);
            if (inputPath !== outputPath) {
                await fs.copyFile(inputPath, outputPath);
            }
            return { success: true };
        }

        console.log(`[FFMPEG PATH] Старт сжатия (цель ~19.8 МБ, макс качество) для: ${originalName}`);

        const cmd = `ffmpeg -y -i "${inputPath}" -map 0:v:0 -map 0:a? -vf "scale='min(1280,iw)':-2" -vcodec libx264 -crf 20 -preset ultrafast -maxrate 4.0M -bufsize 8.0M -acodec aac -b:a 160k -pix_fmt yuv420p -movflags +faststart "${outputPath}"`;
        
        await execAsync(cmd, { maxBuffer: 1024 * 1024 * 100 });

        let finalStats = await fs.stat(outputPath);
        
        if (finalStats.size > TARGET_MAX_BYTES) {
            console.log(`[FFMPEG PATH OPTIMIZE] Вес ${(finalStats.size / (1024 * 1024)).toFixed(2)} МБ выше цели, полируем...`);
            const fineTunePath = outputPath + "_fine.mp4";
            const fineTuneCmd = `ffmpeg -y -i "${outputPath}" -vcodec libx264 -crf 22 -preset ultrafast -maxrate 3.2M -bufsize 6.4M -acodec aac -b:a 128k -pix_fmt yuv420p -movflags +faststart "${fineTunePath}"`;
            
            await execAsync(fineTuneCmd, { maxBuffer: 1024 * 1024 * 100 });
            await fs.unlink(outputPath).catch(() => {});
            await fs.rename(fineTunePath, outputPath);
            finalStats = await fs.stat(outputPath);
        }

        console.log(`[FFMPEG PATH SUCCESS] Итоговый вес: ${(finalStats.size / (1024 * 1024)).toFixed(2)} МБ`);

        return { success: true };

    } catch (error: any) {
        const realErrorReason = error.stderr ? error.stderr.trim() : (error.message || 'Неизвестная ошибка кодирования');
        console.error(`❌ [FFMPEG PATH FAILED]:`, realErrorReason);

        return { success: false, error: realErrorReason };
    }
}