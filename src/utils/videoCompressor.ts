import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";

const execAsync = promisify(exec);
const MAX_ALLOWED_SIZE_BYTES = 20 * 1024 * 1024; // 20 МБ
const TARGET_MAX_BYTES = 19.5 * 1024 * 1024; // Целевой максимум 19.5 МБ под Telegram

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
 * Сборный гибридный компрессор: расчет битрейта по длительности + ультрабыстрый 1-pass режим без 502 ошибок
 */
export async function compressVideoPath(
    inputPath: string,
    outputPath: string,
    originalName: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const stats = await fs.stat(inputPath);

        if (stats.size <= MAX_ALLOWED_SIZE_BYTES) {
            console.log(`[FFMPEG HYBRID] Файл уже меньше 20 МБ (${(stats.size / (1024 * 1024)).toFixed(2)} МБ). Пропускаем сжатие.`);
            if (inputPath !== outputPath) {
                await fs.copyFile(inputPath, outputPath);
            }
            return { success: true };
        }

        const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        console.log(`[FFMPEG HYBRID] Анализ файла ${sizeMB} МБ (${originalName})...`);

        // 1. Узнаем точную длительность видео для точного расчета битрейта
        const duration = await getVideoDuration(inputPath);
        
        let calculatedVideoBitrate = 1400000; // Дефолт на случай, если длительность не определилась (~1.4 Mbps)

        if (duration > 0) {
            // Математический расчет под 19.5 МБ с учетом аудио (128 кбит/с)
            const targetBits = TARGET_MAX_BYTES * 8;
            const audioBitrateBits = 128000 * duration;
            const targetVideoBits = targetBits - audioBitrateBits;
            
            calculatedVideoBitrate = Math.floor(targetVideoBits / duration);

            // Безопасные лимиты: от 200k до 2500k
            if (calculatedVideoBitrate < 200000) calculatedVideoBitrate = 200000;
            if (calculatedVideoBitrate > 2500000) calculatedVideoBitrate = 2500000;
        }

        const videoBitrateKbps = Math.floor(calculatedVideoBitrate / 1000);
        const videoBitrateStr = `${videoBitrateKbps}k`;
        const maxRateStr = `${Math.floor(videoBitrateKbps * 1.3)}k`;
        const bufSizeStr = `${Math.floor(videoBitrateKbps * 2)}k`;

        console.log(`[FFMPEG HYBRID] Длительность: ${duration.toFixed(1)}с. Расчетный битрейт: ${videoBitrateStr}`);

        // 2. МОЛНИЕНОСНЫЙ ОДНОПРОХОДНЫЙ КОД (Ultrafast) — гарантирует отсутствие 502 таймаутов
        const cmd = `ffmpeg -y -i "${inputPath}" -vf "scale='min(1280,iw)':-2" -vcodec libx264 -crf 28 -preset ultrafast -b:v ${videoBitrateStr} -maxrate ${maxRateStr} -bufsize ${bufSizeStr} -acodec aac -b:a 128k -pix_fmt yuv420p -movflags +faststart "${outputPath}"`;
        
        await execAsync(cmd, { maxBuffer: 1024 * 1024 * 100 });

        let finalStats = await fs.stat(outputPath);
        let finalSizeMB = finalStats.size / (1024 * 1024);

        console.log(`[FFMPEG HYBRID CHECK] Вес после сжатия: ${finalSizeMB.toFixed(2)} МБ`);

        // 3. Быстрая страховка (если из-за специфики кадра файл все же превысил 19.5 МБ)
        if (finalStats.size > TARGET_MAX_BYTES) {
            console.log(`[FFMPEG HYBRID OPTIMIZE] Точечный микро-дожим...`);
            const fineTunePath = outputPath + "_fine.mp4";
            const lowerBitrate = Math.max(200, Math.floor(videoBitrateKbps * 0.8));
            
            const fineTuneCmd = `ffmpeg -y -i "${outputPath}" -vcodec libx264 -crf 30 -preset ultrafast -b:v ${lowerBitrate}k -maxrate ${Math.floor(lowerBitrate * 1.2)}k -bufsize ${lowerBitrate * 2}k -acodec aac -b:a 96k -pix_fmt yuv420p -movflags +faststart "${fineTunePath}"`;
            
            await execAsync(fineTuneCmd, { maxBuffer: 1024 * 1024 * 100 });
            await fs.unlink(outputPath).catch(() => {});
            await fs.rename(fineTunePath, outputPath);
            
            finalStats = await fs.stat(outputPath);
            console.log(`[FFMPEG HYBRID SUCCESS] Окончательный идеальный вес: ${(finalStats.size / (1024 * 1024)).toFixed(2)} МБ`);
        }

        return { success: true };

    } catch (error: any) {
        const realErrorReason = error.stderr ? error.stderr.trim() : (error.message || 'Ошибка кодирования');
        console.error(`❌ [FFMPEG HYBRID FAILED]:`, realErrorReason);

        return { success: false, error: realErrorReason };
    }
}