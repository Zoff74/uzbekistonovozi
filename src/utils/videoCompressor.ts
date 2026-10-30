import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import os from "os";
import fs from "fs/promises";

const execAsync = promisify(exec);

/**
 * Сжатие видео через буфер (безопасно: внутри использует диск через os.tmpdir, не вешая RAM)
 */
export async function compressVideoBuffer(
    videoBuffer: Buffer, 
    originalName: string
): Promise<{ success: boolean; buffer?: Buffer; error?: string }> {
    const tempDir = os.tmpdir();
    const uniqueId = Date.now();
    const safeName = originalName.replace(/[^a-zA-Z0-9.-]/g, "_");
    const inputPath = path.join(tempDir, `in_${uniqueId}_${safeName}`);
    const outputPath = path.join(tempDir, `out_${uniqueId}.mp4`);

    try {
        console.log(`[FFMPEG BUFFER->DISK] Старт сжатия для: ${originalName} (${(videoBuffer.length / (1024 * 1024)).toFixed(2)} МБ)`);
        await fs.writeFile(inputPath, videoBuffer);

        // Умный scale: если видео больше 720p — сожмет до 720p, если меньше — не тронет (защита от апскейла)
        const cmd = `ffmpeg -y -i "${inputPath}" -map 0:v:0 -map 0:a? -vf "scale='min(1280,iw)':-2" -vcodec libx264 -crf 26 -preset ultrafast -maxrate 1.8M -bufsize 3.6M -acodec aac -b:a 96k -pix_fmt yuv420p -movflags +faststart "${outputPath}"`;
        
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
 * Чистое сжатие по путям на диске
 */
export async function compressVideoPath(
    inputPath: string, 
    outputPath: string, 
    originalName: string
): Promise<{ success: boolean; error?: string }> {
    try {
        console.log(`[FFMPEG PATH] Старт сжатия с диска для: ${originalName}`);

        // Умный scale: если видео больше 720p — сожмет до 720p, если меньше — не тронет
        const cmd = `ffmpeg -y -i "${inputPath}" -map 0:v:0 -map 0:a? -vf "scale='min(1280,iw)':-2" -vcodec libx264 -crf 26 -preset ultrafast -maxrate 1.8M -bufsize 3.6M -acodec aac -b:a 96k -pix_fmt yuv420p -movflags +faststart "${outputPath}"`;
        
        await execAsync(cmd, { maxBuffer: 1024 * 1024 * 50 });

        const stats = await fs.stat(outputPath);
        console.log(`[FFMPEG PATH] Успешно! Вес: ${(stats.size / (1024 * 1024)).toFixed(2)} МБ`);

        return { success: true };
    } catch (error: any) {
        console.error(`[FFMPEG PATH ERROR]:`, error);
        return { success: false, error: error.message || "Ошибка сжатия видео" };
    }
}