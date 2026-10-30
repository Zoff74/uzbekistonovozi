import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import os from "os";
import fs from "fs/promises";

const execAsync = promisify(exec);

export async function compressVideoBuffer(videoBuffer: Buffer, originalName: string): Promise<{ success: boolean; buffer?: Buffer; error?: string }> {
    const tempDir = os.tmpdir();
    const uniqueId = Date.now();
    const safeName = originalName.replace(/[^a-zA-Z0-9.-]/g, "_");
    const inputPath = path.join(tempDir, `in_${uniqueId}_${safeName}`);
    const outputPath = path.join(tempDir, `out_${uniqueId}.mp4`);

    try {
        console.log(`[FFMPEG ASYNC] Старт сжатия MKV/Видео для: ${originalName} (${(videoBuffer.length / (1024 * 1024)).toFixed(2)} МБ)`);
        await fs.writeFile(inputPath, videoBuffer);

        // -map 0:v:0 -map 0:a:0 берет ТОЛЬКО первую видео и первую аудио дорожку (игнорируя тяжелые субтитры и мусор в MKV)
        // -preset ultrafast снижает нагрузку на CPU
        const cmd = `ffmpeg -y -i "${inputPath}" -map 0:v:0 -map 0:a? -vcodec libx264 -crf 26 -preset ultrafast -maxrate 1.8M -bufsize 3.6M -acodec aac -b:a 96k -pix_fmt yuv420p -movflags +faststart "${outputPath}"`;
        
        console.log(`[FFMPEG ASYNC] Выполнение команды...`);
        
        // Используем асинхронный exec, чтобы Render не вешал 502 из-за блокировки потока
        const { stdout, stderr } = await execAsync(cmd, { maxBuffer: 1024 * 1024 * 10 });
        if (stderr) {
            console.log(`[FFMPEG LOG]:`, stderr.slice(-300)); // Выводим хвост логов ffmpeg для отладки
        }

        const compressedBuffer = await fs.readFile(outputPath);
        const finalSizeMB = compressedBuffer.length / (1024 * 1024);
        console.log(`[FFMPEG ASYNC] Успешно! Итоговый вес: ${finalSizeMB.toFixed(2)} МБ`);

        await fs.unlink(inputPath).catch(() => {});
        await fs.unlink(outputPath).catch(() => {});

        return { success: true, buffer: compressedBuffer };

    } catch (error: any) {
        await fs.unlink(inputPath).catch(() => {});
        await fs.unlink(outputPath).catch(() => {});
        console.error(`[FFMPEG ASYNC ERROR]:`, error);
        return { success: false, error: error.message || "Ошибка сжатия видео на сервере" };
    }
}