// public\workers\compressionWorker.js - Это фоновый воркер, который крутится в отдельном потоке браузера и позволяет юзеру закрыть вкладу где происходит сжимание видео и не ждать окончание сжатия.
importScripts('https://unpkg.com/@ffmpeg/ffmpeg@0.12.6/dist/umd/ffmpeg.js');
importScripts('https://unpkg.com/@ffmpeg/util@0.12.1/dist/umd/index.js');

let ffmpeg = null;

self.onmessage = async (e) => {
    const { file } = e.data;

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

        const inputName = `input_${Date.now()}.mp4`;
        const outputName = `output_${Date.now()}.mp4`;

        const fileData = await FFmpegUtil.fetchFile(file);
        await ffmpeg.writeFile(inputName, fileData);

        // Тяжелая кодировка в фоне
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

        // Отправляем готовый буфер обратно в главный поток
        const uint8 = new Uint8Array(data);
        const arrayBuffer = new ArrayBuffer(uint8.length);
        new Uint8Array(arrayBuffer).set(uint8);

        self.postMessage({ type: 'SUCCESS', arrayBuffer, originalName: file.name });

    } catch (err) {
        self.postMessage({ type: 'ERROR', message: err.message });
    }
};