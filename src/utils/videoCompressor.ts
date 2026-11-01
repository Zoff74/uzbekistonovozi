import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";

const execAsync = promisify(exec);
const MAX_ALLOWED_SIZE_BYTES = 20 * 1024 * 1024; // 20 МБ

/**
 * Сбалансированный компрессор: без плавающих кубиков на динамике и без таймаутов
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
        console.log(`[FFMPEG] Плавное сжатие без артефактов файла ${sizeMB} МБ (${originalName})...`);

        // Что изменилось для борьбы с периодическими кубиками:
        // 1. CRF 25 — повышает общую детализацию (убирает легкую зернистость).
        // 2. -rc-lookahead 40 — заставляет кодировщик анализировать движение наперед, 
        //    чтобы плавно перераспределять битрейт на динамичных сценах (где раньше возникали кубики).
        // 3. Сохранили -preset superfast и -tune film для высокой скорости без обрыва сети.
        const cmd = `ffmpeg -y -i "${inputPath}" -map 0:v:0 -map 0:a? -vf "scale='min(854,iw)':-2" -vcodec libx264 -crf 25 -preset superfast -tune film -rc-lookahead 40 -acodec aac -b:a 96k -pix_fmt yuv420p -movflags +faststart "${outputPath}"`;
        
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