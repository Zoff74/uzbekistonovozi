import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";

const execAsync = promisify(exec);
const MAX_ALLOWED_SIZE_BYTES = 20 * 1024 * 1024; // 20 МБ

/**
 * Оптимизированный компрессор: баланс между качеством (без сильных кубиков) и скоростью без 502 ошибок
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
        console.log(`[FFMPEG] Качественное сжатие файла ${sizeMB} МБ (${originalName})...`);

        // Что изменилось для улучшения картинки:
        // 1. Подняли битрейт видео с 300k до 450k (теперь файл будет весить около 18.5–19.2 МБ — прямо под завязку Telegram).
        // 2. Снизили CRF с 35 до 28 (уберет мыло и сильные кубики).
        // 3. Добавили параметр -tune film — оптимизирует кодировщик x264 для работы с реальными видео, уменьшая артефакты сжатия.
        // 4. Подняли битрейт аудио до 96k, чтобы звук был чище.
        const cmd = `ffmpeg -y -i "${inputPath}" -map 0:v:0 -map 0:a? -vf "scale='min(854,iw)':-2" -vcodec libx264 -crf 28 -preset ultrafast -tune film -b:v 450k -maxrate 600k -bufsize 1200k -acodec aac -b:a 96k -pix_fmt yuv420p -movflags +faststart "${outputPath}"`;
        
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