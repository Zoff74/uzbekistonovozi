//src\utils\videoCompressor.ts
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpegInstance: FFmpeg | null = null;

async function getFFmpeg(): Promise<FFmpeg> {
    if (ffmpegInstance && ffmpegInstance.loaded) {
        return ffmpegInstance;
    }

    const ffmpeg = new FFmpeg();
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';

    await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });

    ffmpegInstance = ffmpeg;
    return ffmpegInstance;
}

export async function compressVideoOnClient(
    file: File,
    onProgress?: (progress: number) => void
): Promise<File> {
    const ffmpeg = await getFFmpeg();

    if (onProgress) {
        ffmpeg.on('progress', ({ progress }) => {
            const percent = Math.min(Math.round(progress * 100), 100);
            onProgress(percent);
        });
    }

    const inputName = `input_${Date.now()}.${file.name.split('.').pop() || 'mp4'}`;
    const outputName = `output_${Date.now()}.mp4`;

    await ffmpeg.writeFile(inputName, await fetchFile(file));

    // Сжимаем прямо в браузере под лимиты Telegram (< 20 МБ)
    await ffmpeg.exec([
        '-i', inputName,
        '-vf', "scale='min(854,iw)':-2",
        '-vcodec', 'libx264',
        '-crf', '28',
        '-preset', 'ultrafast',
        '-acodec', 'aac',
        '-b:a', '96k',
        '-movflags', '+faststart',
        outputName
    ]);

    const data = await ffmpeg.readFile(outputName);

    await ffmpeg.deleteFile(inputName);
    await ffmpeg.deleteFile(outputName);

    // Жестко выделяем чистый стандартный ArrayBuffer и копируем туда данные
    let arrayBuffer: ArrayBuffer;
    if (typeof data === 'string') {
        arrayBuffer = new TextEncoder().encode(data).buffer;
    } else {
        const uint8 = new Uint8Array(data);
        arrayBuffer = new ArrayBuffer(uint8.length);
        new Uint8Array(arrayBuffer).set(uint8);
    }

    const blob = new Blob([arrayBuffer], { type: "video/mp4" });
    const newFileName = file.name.replace(/\.[^/.]+$/, "") + ".mp4";

    return new File([blob], newFileName, { type: "video/mp4" });
}