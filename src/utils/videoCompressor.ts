import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";

const execAsync = promisify(exec);
const MAX_ALLOWED_SIZE_BYTES = 20 * 1024 * 1024; // 20 МБ
const TARGET_SAFE_BYTES = 18.5 * 1024 * 1024; // 18.5 МБ

async function getVideoDuration(filePath: string): Promise<number> {
    try {
        const { stdout } = await execAsync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`);
        const duration = parseFloat(stdout.trim());
        return isNaN(duration) || duration <= 0 ? 0 : duration;
    } catch {
        return 0;
    }
}

export async function compressVideoPath(
    inputPath: string,
    outputPath: string,
    originalName: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const stats = await fs.stat(inputPath);

        if (stats.size <= MAX_ALLOWED_SIZE_BYTES) {
            console.log(`[FFMPEG] Файл уже меньше 20 МБ. Пропускаем.`);
            if (inputPath !== outputPath) {
                await fs.copyFile(inputPath, outputPath);
            }
            return { success: true };
        }

        const duration = await getVideoDuration(inputPath);
        let videoBitrateKbps = 400;

        if (duration > 0) {
            const targetBits = TARGET_SAFE_BYTES * 8;
            const audioBits = 96000 * duration;
            const targetVideoBits = targetBits - audioBits;
            const calculated = Math.floor((targetVideoBits / duration) / 1000);
            videoBitrateKbps = Math.max(250, Math.min(calculated, 700));
        }

        console.log(`[FFMPEG] Запуск конвертации. Длительность: ${duration.toFixed(1)}с, Битрейт: ${videoBitrateKbps}k`);

        // Убран тяжелый maxBuffer, чтобы Node.js не забивал оперативную память логами FFmpeg
        const cmd = `ffmpeg -y -i "${inputPath}" -map 0:v:0 -map 0:a? -vf "scale='min(854,iw)':-2" -vcodec libx264 -crf 26 -preset ultrafast -tune film -b:v ${videoBitrateKbps}k -maxrate ${Math.floor(videoBitrateKbps * 1.25)}k -bufsize ${videoBitrateKbps * 2}k -acodec aac -b:a 96k -pix_fmt yuv420p -movflags +faststart "${outputPath}"`;
        
        // Запуск без огромного буфера по умолчанию
        await execAsync(cmd);

        const finalStats = await fs.stat(outputPath);
        console.log(`[FFMPEG SUCCESS] Готово! Вес: ${(finalStats.size / (1024 * 1024)).toFixed(2)} МБ`);

        return { success: true };

    } catch (error: any) {
        const realErrorReason = error.stderr ? error.stderr.trim() : (error.message || 'Ошибка кодирования');
        console.error(`❌ [FFMPEG ERROR]:`, realErrorReason);
        return { success: false, error: realErrorReason };
    }
}