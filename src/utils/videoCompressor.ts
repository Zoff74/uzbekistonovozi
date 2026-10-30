import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import os from "os";
import fs from "fs/promises";

const execAsync = promisify(exec);
const MAX_ALLOWED_SIZE_BYTES = 20 * 1024 * 1024; // 20 МБ

async function getVideoDuration(filePath: string): Promise<number> {
    try {
        const { stdout, stderr } = await execAsync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`);
        const duration = parseFloat(stdout.trim());
        return isNaN(duration) || duration <= 0 ? 180 : duration;
    } catch (err: any) {
        console.error(`[FFPROBE FAILED] Не удалось замерить длительность:`, err.stderr || err.message);
        return 180;
    }
}

export async function compressVideoBuffer(
    videoBuffer: Buffer, 
    originalName: string
): Promise<{ success: boolean; buffer?: Buffer; error?: string }> {
    if (videoBuffer.length <= MAX_ALLOWED_SIZE_BYTES) {
        return { success: true, buffer: videoBuffer };
    }

    const tempDir = os.tmpdir();
    const uniqueId = Date.now();
    const safeName = originalName.replace(/[^a-zA-Z0-9.-]/g, "_");
    const inputPath = path.join(tempDir, `in_${uniqueId}_${safeName}`);
    const outputPath = path.join(tempDir, `out_${uniqueId}.mp4`);

    try {
        await fs.writeFile(inputPath, videoBuffer);
        const durationSec = await getVideoDuration(inputPath);
        
        const targetAudioBits = 96 * 1024 * durationSec;
        const targetVideoBits = 19 * 1024 * 1024 * 8 - targetAudioBits;
        
        let calculatedVideoBitrateKbps = Math.floor((targetVideoBits / durationSec) / 1000);
        if (calculatedVideoBitrateKbps < 300) calculatedVideoBitrateKbps = 300;
        if (calculatedVideoBitrateKbps > 3000) calculatedVideoBitrateKbps = 3000;

        const videoBitrateStr = `${calculatedVideoBitrateKbps}k`;
        const bufSizeStr = `${calculatedVideoBitrateKbps * 2}k`;

        const cmd = `ffmpeg -y -i "${inputPath}" -map 0:v:0 -map 0:a? -vf "scale='min(1280,iw)':-2" -vcodec libx264 -b:v ${videoBitrateStr} -maxrate ${videoBitrateStr} -bufsize ${bufSizeStr} -preset fast -acodec aac -b:a 96k -pix_fmt yuv420p -movflags +faststart "${outputPath}"`;
        
        console.log(`[FFMPEG RUN] ${cmd}`);
        
        // Запускаем кодирование (вывод stderr от ffmpeg пишем в консоль, чтобы видеть прогресс и причину падения)
        await execAsync(cmd, { maxBuffer: 1024 * 1024 * 100 });

        const compressedBuffer = await fs.readFile(outputPath);

        await fs.unlink(inputPath).catch(() => {});
        await fs.unlink(outputPath).catch(() => {});

        return { success: true, buffer: compressedBuffer };

    } catch (error: any) {
        await fs.unlink(inputPath).catch(() => {});
        await fs.unlink(outputPath).catch(() => {});
        
        // ФИКСИРУЕМ ТОЧНУЮ ПРИЧИНУ: Берём stderr от ffmpeg или системное сообщение Node.js
        const realErrorReason = error.stderr ? error.stderr.trim() : (error.message || 'Неизвестная ошибка процесса');
        
        console.error(`❌ [FFMPEG FAILED ON FILE: ${originalName}]`);
        console.error(realErrorReason);

        return { 
            success: false, 
            error: `FFmpeg Fail: ${realErrorReason}` 
        };
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
            if (inputPath !== outputPath) await fs.copyFile(inputPath, outputPath);
            return { success: true };
        }

        const durationSec = await getVideoDuration(inputPath);
        
        const targetAudioBits = 96 * 1024 * durationSec;
        const targetVideoBits = 19 * 1024 * 1024 * 8 - targetAudioBits;
        
        let calculatedVideoBitrateKbps = Math.floor((targetVideoBits / durationSec) / 1000);
        if (calculatedVideoBitrateKbps < 300) calculatedVideoBitrateKbps = 300;
        if (calculatedVideoBitrateKbps > 3000) calculatedVideoBitrateKbps = 3000;

        const videoBitrateStr = `${calculatedVideoBitrateKbps}k`;
        const bufSizeStr = `${calculatedVideoBitrateKbps * 2}k`;

        const cmd = `ffmpeg -y -i "${inputPath}" -map 0:v:0 -map 0:a? -vf "scale='min(1280,iw)':-2" -vcodec libx264 -b:v ${videoBitrateStr} -maxrate ${videoBitrateStr} -bufsize ${bufSizeStr} -preset fast -acodec aac -b:a 96k -pix_fmt yuv420p -movflags +faststart "${outputPath}"`;
        
        console.log(`[FFMPEG PATH RUN] ${cmd}`);

        await execAsync(cmd, { maxBuffer: 1024 * 1024 * 100 });

        return { success: true };
    } catch (error: any) {
        const realErrorReason = error.stderr ? error.stderr.trim() : (error.message || 'Неизвестная ошибка процесса');
        
        console.error(`❌ [FFMPEG PATH FAILED ON FILE: ${originalName}]`);
        console.error(realErrorReason);

        return { 
            success: false, 
            error: `FFmpeg Path Fail: ${realErrorReason}` 
        };
    }
}