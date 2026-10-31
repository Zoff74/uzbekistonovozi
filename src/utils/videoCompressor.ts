import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";

const execAsync = promisify(exec);
const MAX_ALLOWED_SIZE_BYTES = 20 * 1024 * 1024; // 20 МБ
const TARGET_MAX_BYTES = 19.5 * 1024 * 1024; // Целевой максимум 19.5 МБ

/**
 * Максимально качественное сжатие точно под лимит Telegram (19.5 МБ)
 */
export async function compressVideoPath(
    inputPath: string,
    outputPath: string,
    originalName: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const stats = await fs.stat(inputPath);

        if (stats.size <= MAX_ALLOWED_SIZE_BYTES) {
            console.log(`[FFMPEG PATH] Файл уже меньше 20 МБ (${(stats.size / (1024 * 1024)).toFixed(2)} МБ). Пропускаем сжатие.`);
            if (inputPath !== outputPath) {
                await fs.copyFile(inputPath, outputPath);
            }
            return { success: true };
        }

        const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        console.log(`[FFMPEG PATH] Старт компрессии файла ${sizeMB} МБ (${originalName}) с прицелом на ~19.5 МБ...`);

        // Выставляем высокий битрейт видео (~2200k), чтобы сохранить максимум деталей
        const cmd = `ffmpeg -y -i "${inputPath}" -vf "scale='min(1920,iw)':-2" -vcodec libx264 -crf 23 -preset medium -b:v 2200k -maxrate 2500k -bufsize 5000k -acodec aac -b:a 128k -pix_fmt yuv420p -movflags +faststart "${outputPath}"`;
        
        await execAsync(cmd, { maxBuffer: 1024 * 1024 * 100 });

        let finalStats = await fs.stat(outputPath);
        let finalSizeMB = finalStats.size / (1024 * 1024);

        console.log(`[FFMPEG PATH CHECK] Промежуточный вес: ${finalSizeMB.toFixed(2)} МБ`);

        // Если файл всё еще превышает 19.5 МБ, аккуратно дожимаем его до идеала
        if (finalStats.size > TARGET_MAX_BYTES) {
            console.log(`[FFMPEG OPTIMIZE] Вес немного выше 19.5 МБ, точечно поджимаем битрейт...`);
            const fineTunePath = outputPath + "_fine.mp4";
            // Чуть снижаем битрейт, чтобы гарантированно вписаться в 19.5 МБ без потери качества
            const fineTuneCmd = `ffmpeg -y -i "${outputPath}" -vcodec libx264 -crf 26 -preset medium -b:v 1800k -maxrate 2000k -bufsize 4000k -acodec aac -b:a 112k -pix_fmt yuv420p -movflags +faststart "${fineTunePath}"`;
            
            await execAsync(fineTuneCmd, { maxBuffer: 1024 * 1024 * 100 });
            await fs.unlink(outputPath).catch(() => {});
            await fs.rename(fineTunePath, outputPath);
            
            finalStats = await fs.stat(outputPath);
            console.log(`[FFMPEG OPTIMIZE SUCCESS] Идеальный вес: ${(finalStats.size / (1024 * 1024)).toFixed(2)} МБ`);
        }

        return { success: true };

    } catch (error: any) {
        const realErrorReason = error.stderr ? error.stderr.trim() : (error.message || 'Неизвестная ошибка кодирования');
        console.error(`❌ [FFMPEG PATH FAILED]:`, realErrorReason);

        return { success: false, error: realErrorReason };
    }
}