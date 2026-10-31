import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";

const execAsync = promisify(exec);
const MAX_ALLOWED_SIZE_BYTES = 20 * 1024 * 1024; // 20 МБ
const TARGET_MAX_BYTES = 19.5 * 1024 * 1024; // 19.5 МБ лимит

/**
 * Получение длительности видео через ffprobe
 */
async function getVideoDuration(filePath: string): Promise<number> {
    try {
        const { stdout } = await execAsync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`);
        const duration = parseFloat(stdout.trim());
        return isNaN(duration) ? 0 : duration;
    } catch {
        return 0;
    }
}

/**
 * Быстрый компрессор для длинных видео (с адаптивным разрешением 480p для защиты от 502)
 */
export async function compressVideoPath(
    inputPath: string,
    outputPath: string,
    originalName: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const stats = await fs.stat(inputPath);

        if (stats.size <= MAX_ALLOWED_SIZE_BYTES) {
            console.log(`[FFMPEG] Файл уже меньше 20 МБ (${(stats.size / (1024 * 1024)).toFixed(2)} МБ). Пропускаем сжатие.`);
            if (inputPath !== outputPath) {
                await fs.copyFile(inputPath, outputPath);
            }
            return { success: true };
        }

        const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        console.log(`[FFMPEG] Старт сжатия длинного видео ${sizeMB} МБ (${originalName})...`);

        // Узнаем длительность для точного расчета
        const duration = await getVideoDuration(inputPath);
        
        let videoBitrateKbps = 400; // Базовый битрейт для длинных роликов (~400 kbps под 480p)

        if (duration > 0) {
            const targetBits = TARGET_MAX_BYTES * 8;
            const audioBits = 96000 * duration; // Аудио 96кбпс экономит место для видео
            const targetVideoBits = targetBits - audioBits;
            const calculated = Math.floor((targetVideoBits / duration) / 1000);

            // Держим битрейт в пределах разумного для 480p (от 250k до 700k)
            videoBitrateKbps = Math.max(250, Math.min(calculated, 700));
        }

        console.log(`[FFMPEG] Длительность: ${duration.toFixed(1)}с. Целевой битрейт: ${videoBitrateKbps}k`);

        // Снижаем разрешение до 480p (scale=854:-2) — это спасает от 502 и дает отличную четкость при малом весе
        const cmd = `ffmpeg -y -i "${inputPath}" -map 0:v:0 -map 0:a? -vf "scale='min(854,iw)':-2" -vcodec libx264 -crf 30 -preset ultrafast -b:v ${videoBitrateKbps}k -maxrate ${Math.floor(videoBitrateKbps * 1.3)}k -bufsize ${videoBitrateKbps * 2}k -acodec aac -b:a 96k -pix_fmt yuv420p -movflags +faststart "${outputPath}"`;
        
        await execAsync(cmd);

        let finalStats = await fs.stat(outputPath);
        let finalSizeMB = finalStats.size / (1024 * 1024);
        console.log(`[FFMPEG] Результат сжатия: ${finalSizeMB.toFixed(2)} МБ`);

        // Жесткая страховка: если вдруг все еще больше 19.5 МБ
        if (finalStats.size > TARGET_MAX_BYTES) {
            console.log(`[FFMPEG] Финальный микро-дожим...`);
            const fineTunePath = outputPath + "_fine.mp4";
            const lowerRate = Math.max(200, Math.floor(videoBitrateKbps * 0.8));
            
            const fineTuneCmd = `ffmpeg -y -i "${outputPath}" -map 0:v:0 -map 0:a? -vcodec libx264 -crf 32 -preset ultrafast -b:v ${lowerRate}k -maxrate ${Math.floor(lowerRate * 1.2)}k -bufsize ${lowerRate * 2}k -acodec aac -b:a 80k -pix_fmt yuv420p -movflags +faststart "${fineTunePath}"`;
            
            await execAsync(fineTuneCmd);
            await fs.unlink(outputPath).catch(() => {});
            await fs.rename(fineTunePath, outputPath);
            
            finalStats = await fs.stat(outputPath);
            console.log(`[FFMPEG] Итоговый размер: ${(finalStats.size / (1024 * 1024)).toFixed(2)} МБ`);
        }

        return { success: true };

    } catch (error: any) {
        const realErrorReason = error.stderr ? error.stderr.trim() : (error.message || 'Ошибка кодирования');
        console.error(`❌ [FFMPEG ERROR]:`, realErrorReason);
        return { success: false, error: realErrorReason };
    }
}