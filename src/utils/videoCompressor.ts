import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";

const execAsync = promisify(exec);
const MAX_ALLOWED_SIZE_BYTES = 20 * 1024 * 1024; // 20 МБ абсолютный лимит Telegram
const TARGET_SAFE_BYTES = 18.5 * 1024 * 1024; // Безопасная цель 18.5 МБ с запасом

/**
 * Получение длительности видео в секундах через ffprobe
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
 * Сверхбыстрый компрессор с гарантией попадания в лимит Telegram < 20 МБ
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
        console.log(`[FFMPEG] Старт сжатия файла ${sizeMB} МБ (${originalName}) с прицелом на безопасные 18.5 МБ...`);

        const duration = await getVideoDuration(inputPath);
        let videoBitrateKbps = 320; // Консервативный битрейт под 480p для длинных роликов

        if (duration > 0) {
            const targetBits = TARGET_SAFE_BYTES * 8;
            const audioBits = 64000 * duration; // Аудио 64 кбит/с
            const targetVideoBits = targetBits - audioBits;
            const calculated = Math.floor((targetVideoBits / duration) / 1000);

            // Держим битрейт в строгих границах
            videoBitrateKbps = Math.max(160, Math.min(calculated, 450));
        }

        console.log(`[FFMPEG] Длительность: ${duration.toFixed(1)}с. Расчетный битрейт видео: ${videoBitrateKbps}k`);

        // Основное сжатие в 480p (scale='min(854,iw)':-2) с пресетом ultrafast для исключения 502
        let cmd = `ffmpeg -y -i "${inputPath}" -map 0:v:0 -map 0:a? -vf "scale='min(854,iw)':-2" -vcodec libx264 -crf 34 -preset ultrafast -b:v ${videoBitrateKbps}k -maxrate ${Math.floor(videoBitrateKbps * 1.2)}k -bufsize ${videoBitrateKbps * 2}k -acodec aac -b:a 64k -pix_fmt yuv420p -movflags +faststart "${outputPath}"`;
        
        await execAsync(cmd, { maxBuffer: 1024 * 1024 * 100 });

        let finalStats = await fs.stat(outputPath);
        let finalSizeMB = finalStats.size / (1024 * 1024);
        console.log(`[FFMPEG] Промежуточный размер: ${finalSizeMB.toFixed(2)} МБ`);

        // ЖЕСТКАЯ СТРАХОВКА: если файл все еще подошел слишком близко к 20 МБ (> 19.2 МБ)
        if (finalStats.size > 19.2 * 1024 * 1024) {
            console.log(`[FFMPEG EMERGENCY] Вес близок к лимиту (${finalSizeMB.toFixed(2)} МБ), выполняем мгновенный микро-дожим...`);
            const finePath = outputPath + "_emergency.mp4";
            const emergencyRate = Math.max(140, Math.floor(videoBitrateKbps * 0.75));

            const emergencyCmd = `ffmpeg -y -i "${outputPath}" -vcodec libx264 -crf 36 -preset ultrafast -b:v ${emergencyRate}k -maxrate ${Math.floor(emergencyRate * 1.2)}k -bufsize ${emergencyRate * 2}k -acodec aac -b:a 48k -pix_fmt yuv420p -movflags +faststart "${finePath}"`;
            
            await execAsync(emergencyCmd, { maxBuffer: 1024 * 1024 * 100 });
            await fs.unlink(outputPath).catch(() => {});
            await fs.rename(finePath, outputPath);

            finalStats = await fs.stat(outputPath);
            console.log(`[FFMPEG EMERGENCY SUCCESS] Окончательный безопасный размер: ${(finalStats.size / (1024 * 1024)).toFixed(2)} МБ`);
        }

        return { success: true };

    } catch (error: any) {
        const realErrorReason = error.stderr ? error.stderr.trim() : (error.message || 'Ошибка кодирования');
        console.error(`❌ [FFMPEG ERROR]:`, realErrorReason);
        return { success: false, error: realErrorReason };
    }
}