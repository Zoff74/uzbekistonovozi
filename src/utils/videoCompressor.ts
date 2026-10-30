import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";

const execAsync = promisify(exec);

export async function compressVideoPath(inputPath: string, outputPath: string, originalName: string): Promise<{ success: boolean; error?: string }> {
    try {
        console.log(`[FFMPEG PATH] Старт сжатия с диска для: ${originalName}`);

        // -map 0:v:0 -map 0:a? берет первую видео и аудио дорожку, ultrafast разгружает процессор Render
        const cmd = `ffmpeg -y -i "${inputPath}" -map 0:v:0 -map 0:a? -vcodec libx264 -crf 26 -preset ultrafast -maxrate 1.8M -bufsize 3.6M -acodec aac -b:a 96k -pix_fmt yuv420p -movflags +faststart "${outputPath}"`;
        
        console.log(`[FFMPEG PATH] Выполнение команды...`);
        
        await execAsync(cmd, { maxBuffer: 1024 * 1024 * 50 });

        const stats = await fs.stat(outputPath);
        const finalSizeMB = stats.size / (1024 * 1024);
        console.log(`[FFMPEG PATH] Успешно! Итоговый вес на диске: ${finalSizeMB.toFixed(2)} МБ`);

        return { success: true };

    } catch (error: any) {
        console.error(`[FFMPEG PATH ERROR]:`, error);
        return { success: false, error: error.message || "Ошибка сжатия видео на сервере" };
    }
}