import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";

const execAsync = promisify(exec);
const MAX_ALLOWED_SIZE_BYTES = 20 * 1024 * 1024; // 20 МБ
const TARGET_MAX_BYTES = 19.5 * 1024 * 1024; // Целевой максимум 19.5 МБ

/**
 * Однопроходное быстрое сжатие точно под лимит Telegram (19.5 МБ) с защитой от 502 ошибок
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
        console.log(`[FFMPEG PATH] Старт быстрой компрессии файла ${sizeMB} МБ (${originalName}) до ~19.5 МБ...`);

        // Используем ultrafast пресет и один проход, чтобы процессор не вешал сервер и не вызывал 502 таймаут
        const cmd = `ffmpeg -y -i "${inputPath}" -vf "scale='min(1280,iw)':-2" -vcodec libx264 -crf 28 -preset ultrafast -b:v 1400k -maxrate 1800k -bufsize 3600k -acodec aac -b:a 128k -pix_fmt yuv420p -movflags +faststart "${outputPath}"`;
        
        await execAsync(cmd, { maxBuffer: 1024 * 1024 * 100 });

        let finalStats = await fs.stat(outputPath);
        let finalSizeMB = finalStats.size / (1024 * 1024);

        console.log(`[FFMPEG PATH CHECK] Итоговый вес после сжатия: ${finalSizeMB.toFixed(2)} МБ`);

        // Если файл всё же чуть выше 19.5 МБ, делаем быстрый легкий поджим вместо тяжелого второго прохода
        if (finalStats.size > TARGET_MAX_BYTES) {
            console.log(`[FFMPEG OPTIMIZE] Финальная подгонка битрейта...`);
            const fineTunePath = outputPath + "_fine.mp4";
            const fineTuneCmd = `ffmpeg -y -i "${outputPath}" -vcodec libx264 -crf 30 -preset ultrafast -b:v 1100k -maxrate 1400k -bufsize 2800k -acodec aac -b:a 96k -pix_fmt yuv420p -movflags +faststart "${fineTunePath}"`;
            
            await execAsync(fineTuneCmd, { maxBuffer: 1024 * 1024 * 100 });
            await fs.unlink(outputPath).catch(() => {});
            await fs.rename(fineTunePath, outputPath);
            
            finalStats = await fs.stat(outputPath);
            console.log(`[FFMPEG OPTIMIZE SUCCESS] Окончательный вес: ${(finalStats.size / (1024 * 1024)).toFixed(2)} МБ`);
        }

        return { success: true };

    } catch (error: any) {
        const realErrorReason = error.stderr ? error.stderr.trim() : (error.message || 'Неизвестная ошибка кодирования');
        console.error(`❌ [FFMPEG PATH FAILED]:`, realErrorReason);

        return { success: false, error: realErrorReason };
    }
}