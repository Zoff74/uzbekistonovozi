import { execSync } from "child_process";
import path from "path";
import os from "os";
import fs from "fs/promises";

export async function compressVideoBuffer(videoBuffer: Buffer, originalName: string): Promise<{ success: boolean; buffer?: Buffer; error?: string }> {
    const tempDir = os.tmpdir();
    const uniqueId = Date.now();
    const safeName = originalName.replace(/[^a-zA-Z0-9.-]/g, "_");
    const inputPath = path.join(tempDir, `in_${uniqueId}_${safeName}`);
    const outputPath = path.join(tempDir, `out_${uniqueId}.mp4`);

    try {
        console.log(`[FFMPEG NATIVE] Запуск прямого сжатия для: ${originalName} (${(videoBuffer.length / (1024 * 1024)).toFixed(2)} МБ)`);
        await fs.writeFile(inputPath, videoBuffer);

        // Жёсткий и быстрый вызов системного ffmpeg через ultrafast (без зависаний библиотеки)
        const cmd = `ffmpeg -y -i "${inputPath}" -vcodec libx264 -crf 23 -preset ultrafast -maxrate 2.2M -bufsize 4.4M -acodec aac -b:a 128k -pix_fmt yuv420p -movflags +faststart "${outputPath}"`;
        
        execSync(cmd, { stdio: 'inherit' });

        const compressedBuffer = await fs.readFile(outputPath);
        const finalSizeMB = compressedBuffer.length / (1024 * 1024);
        console.log(`[FFMPEG NATIVE] Успешно сжато! Итоговый вес: ${finalSizeMB.toFixed(2)} МБ`);

        await fs.unlink(inputPath).catch(() => {});
        await fs.unlink(outputPath).catch(() => {});

        return { success: true, buffer: compressedBuffer };

    } catch (error: any) {
        await fs.unlink(inputPath).catch(() => {});
        await fs.unlink(outputPath).catch(() => {});
        console.error(`[FFMPEG NATIVE ERROR]:`, error);
        return { success: false, error: error.message || "Ошибка нативного сжатия видео" };
    }
}