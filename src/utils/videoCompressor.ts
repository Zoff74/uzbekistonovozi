import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import os from "os";
import fs from "fs/promises";

const execAsync = promisify(exec);
const MAX_ALLOWED_SIZE_BYTES = 20 * 1024 * 1024; // 20 МБ

/**
 * Сжатие видео через буфер (для telegram.action.ts) — цель ~19.5 МБ
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
        console.log(`[FFMPEG] Старт сжатия файла: ${originalName} (${(videoBuffer.length / (1024 * 1024)).toFixed(2)} МБ)`);
        await fs.writeFile(inputPath, videoBuffer);

        // Битрейт настроен на выходной размер ~19.5 МБ
        const cmd = `ffmpeg -y -i "${inputPath}" -map 0:v:0 -map 0:a? -vf "scale='min(1280,iw)':-2" -vcodec libx264 -crf 23 -preset ultrafast -maxrate 2.8M -bufsize 5.6M -acodec aac -b:a 128k -pix_fmt yuv420p -movflags +faststart "${outputPath}"`;
        
        await execAsync(cmd, { maxBuffer: 1024 * 1024 * 100 });

        const compressedBuffer = await fs.readFile(outputPath);
        const finalSizeMB = compressedBuffer.length / (1024 * 1024);
        console.log(`[FFMPEG SUCCESS] Итоговый вес: ${finalSizeMB.toFixed(2)} МБ`);

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
 * Сжатие видео напрямую по путям на диске (для route.ts) — цель ~19.5 МБ
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

        console.log(`[FFMPEG PATH] Старт сжатия с диска для: ${originalName} (${(stats.size / (1024 * 1024)).toFixed(2)} МБ)`);

        // Битрейт настроен на выходной размер ~19.5 МБ
        const cmd = `ffmpeg -y -i "${inputPath}" -map 0:v:0 -map 0:a? -vf "scale='min(1280,iw)':-2" -vcodec libx264 -crf 23 -preset ultrafast -maxrate 2.8M -bufsize 5.6M -acodec aac -b:a 128k -pix_fmt yuv420p -movflags +faststart "${outputPath}"`;
        
        await execAsync(cmd, { maxBuffer: 1024 * 1024 * 100 });

        const finalStats = await fs.stat(outputPath);
        console.log(`[FFMPEG PATH SUCCESS] Итоговый вес: ${(finalStats.size / (1024 * 1024)).toFixed(2)} МБ`);

        return { success: true };

    } catch (error: any) {
        const realErrorReason = error.stderr ? error.stderr.trim() : (error.message || 'Неизвестная ошибка кодирования');
        console.error(`❌ [FFMPEG PATH FAILED]:`, realErrorReason);

        return { success: false, error: realErrorReason };
    }
}