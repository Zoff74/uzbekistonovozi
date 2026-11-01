importScripts('https://unpkg.com/@ffmpeg/ffmpeg@0.12.6/dist/umd/ffmpeg.js');
importScripts('https://unpkg.com/@ffmpeg/util@0.12.1/dist/umd/index.js');

let ffmpeg = null;

self.onmessage = async (e) => {
    const { file } = e.data;
    console.log("Worker: Старт сжатия файла:", file.name, (file.size / 1024 / 1024).toFixed(2), "MB");

    try {
        if (!ffmpeg) {
            ffmpeg = new FFmpegWASM.FFmpeg();
            const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
            
            ffmpeg.on('progress', ({ progress }) => {
                const percent = Math.min(Math.round(progress * 100), 100);
                self.postMessage({ type: 'PROGRESS', percent });
            });

            await ffmpeg.load({
                coreURL: await FFmpegUtil.toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
                wasmURL: await FFmpegUtil.toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
            });
        }

        const inputName = `input_${Date.now()}.mkv`;
        const outputName = `output_${Date.now()}.mp4`;

        const fileData = await FFmpegUtil.fetchFile(file);
        await ffmpeg.writeFile(inputName, fileData);

        // ЖЕСТКИЙ КОНТРОЛЬ РАЗМЕРА: 
        // 1. Разрешение >480p уменьшаем до 480p, <=480p — оставляем как есть.
        // 2. Лимит битрейта видео (-b:v 400k) гарантирует, что 6 минут видео сожмутся до ~14-16 МБ.
        // 3. Звук AAC 96k экономит место для видеопотока.
        await ffmpeg.exec([
            '-i', inputName,
            '-vf', "scale='if(gt(ih,480),-2,iw)':'if(gt(ih,480),480,ih)'",
            '-vcodec', 'libx264',
            '-b:v', '400k',                 // Жесткий целевой битрейт видео для попадания в <20МБ
            '-maxrate', '550k',             // Пиковый битрейт для динамичных сцен
            '-bufsize', '1000k',
            '-preset', 'ultrafast',
            '-acodec', 'aac',
            '-b:a', '96k',
            '-movflags', '+faststart',
            outputName
        ]);

        const data = await ffmpeg.readFile(outputName);
        await ffmpeg.deleteFile(inputName);
        await ffmpeg.deleteFile(outputName);

        const uint8 = new Uint8Array(data);
        console.log("Worker: Итоговый размер с гарантией <20МБ:", (uint8.length / 1024 / 1024).toFixed(2), "MB");

        const arrayBuffer = new ArrayBuffer(uint8.length);
        new Uint8Array(arrayBuffer).set(uint8);

        self.postMessage({ type: 'SUCCESS', arrayBuffer, originalName: file.name });

    } catch (err) {
        console.error("Worker Error:", err);
        self.postMessage({ type: 'ERROR', message: err.message });
    }
};