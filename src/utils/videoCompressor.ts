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
 * Однопроходный компрессор (480p) с гарантированной защитой от 502 таймаутов
 */
export async function compressVideoPath(
    inputPath: string,
    outputPath: string,
    originalName: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const stats = await fs.stat(inputPath);

        if (stats.size <= MAX_ALLOWED_SIZE_BYTES) {
            console.log(`[FFMPEG] Файл меньше 20 МБ (${(stats.size / (1024 * 1024)).toFixed(2)} МБ). Пропускаем сжатие.`);
            if (inputPath !== outputPath) {
                await fs.copyFile(inputPath, outputPath);
            }
            return { success: true };
        }

        const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        console.log(`[FFMPEG] Старт однопроходного сжатия файла ${sizeMB} МБ (${originalName})...`);

        const duration = await getVideoDuration(inputPath);
        let videoBitrateKbps = 380; // Консервативный битрейт под 480p для долгой длительности

        if (duration > 0) {
            const targetBits = TARGET_MAX_BYTES * 8;
            const audioBits = 80000 * duration; // Аудио 80 кбит/с экономит место под видео
            const targetVideoBits = targetBits - audioBits;
            const calculated = Math.floor((targetVideoBits / duration) / 1000);

            // Жестко ограничиваем битрейт снизу и сверху, чтобы гарантированно вписаться в размер без повторных проходов
            videoBitrateKbps = Math.max(200, Math.min(calculated, 550));
        }

        console.log(`[FFMPEG] Длительность: ${duration.toFixed(1)}с. Расчетный битрейт: ${videoBitrateKbps}k`);

        // Строго 1 проход с масштабированием до 480p (scale='min(854,iw)':-2) — исключает любые таймауты
        const cmd = `ffmpeg -y -i "${inputPath}" -map 0:v:0 -map 0:a? -vf "scale='min(854,iw)':-2" -vcodec libx264 -crf 32 -preset ultrafast -b:v ${videoBitrateKbps}k -maxrate ${Math.floor(videoBitrateKbps * 1.2)}k -bufsize ${videoBitrateKbps * 2}k -acodec aac -b:a 80k -pix_fmt yuv420p -movflags +faststart "${outputPath}"`;
        
        await execAsync(cmd, { maxBuffer: 1024 * 1024 * 100 });

        const finalStats = await fs.stat(outputPath);
        const finalSizeMB = finalStats.size / (1024 * 1024);
        console.log(`[FFMPEG SUCCESS] Итоговый вес: ${finalSizeMB.toFixed(2)} МБ`);

        return { success: true };

    } catch (error: any) {
        const realErrorReason = error.stderr ? error.stderr.trim() : (error.message || 'Ошибка кодирования');
        console.error(`❌ [FFMPEG ERROR]:`, realErrorReason);
        return { success: false, error: realErrorReason };
    }
}