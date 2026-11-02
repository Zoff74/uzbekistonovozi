importScripts('./ffmpeg.js');
importScripts('./ffmpeg-util.js');

let ffmpeg = null;
let lastSentTime = 0;

function sendLog(text) {
    console.log(text);
    self.postMessage({ type: 'LOG', message: text });
}

self.onmessage = async (e) => {
    const file = e.data && e.data.file;
    
    if (!file) {
        sendLog("❌ Ошибка: Файл не передан в воркер");
        self.postMessage({ type: 'ERROR', message: 'Файл не передан в воркер' });
        return;
    }

    sendLog(`🎬 Старт: ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`);

    try {
        if (!ffmpeg) {
            sendLog("⚙️ Инициализация FFmpeg...");
            ffmpeg = new FFmpegWASM.FFmpeg();
            
            const baseURL = '/workers';
            
            ffmpeg.on('progress', ({ progress }) => {
                const now = Date.now();
                if (now - lastSentTime > 500) {
                    lastSentTime = now;
                    const percent = Math.min(Math.round(progress * 100), 100);
                    self.postMessage({ type: 'PROGRESS', percent });
                }
            });

            sendLog("📥 Загрузка ядра FFmpeg локально...");
            const coreURL = await FFmpegUtil.toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript');
            const wasmURL = await FFmpegUtil.toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm');

            await ffmpeg.load({ coreURL, wasmURL });
            sendLog("✅ FFmpeg успешно загружен в память");
        } else {
            sendLog("♻️ Используется ранее загруженный FFmpeg");
        }

        const uniqueSuffix = Date.now();
        const inputName = `input_${uniqueSuffix}.mp4`;
        const outputName = `output_${uniqueSuffix}.mp4`;

        sendLog("📂 Чтение файла в память (ArrayBuffer)...");
        const arrayBufferData = await file.arrayBuffer();
        
        sendLog(`✍️ Запись файла в виртуальную файловую систему (${arrayBufferData.byteLength} байт)...`);
        await ffmpeg.writeFile(inputName, new Uint8Array(arrayBufferData));

        const args = [
            '-i', inputName,
            '-vf', "scale='if(gt(ih,480),-2,iw)':'if(gt(ih,480),480,ih)'",
            '-vcodec', 'libx264',
            '-b:v', '400k',
            '-maxrate', '550k',
            '-bufsize', '1000k',
            '-preset', 'ultrafast',
            '-acodec', 'aac',
            '-b:a', '96k',
            '-movflags', '+faststart',
            outputName
        ];

        sendLog("🔄 Запуск сжатия видео (ffmpeg.exec)...");
        const startTime = Date.now();
        await ffmpeg.exec(args);
        sendLog(`⚡ Сжатие завершено за ${(Date.now() - startTime) / 1000} сек.`);

        sendLog("📖 Чтение сжатого файла...");
        const data = await ffmpeg.readFile(outputName);
        
        sendLog("🧹 Очистка временных файлов...");
        await ffmpeg.deleteFile(inputName).catch(() => {});
        await ffmpeg.deleteFile(outputName).catch(() => {});

        const uint8 = new Uint8Array(data);
        sendLog(`📦 Итог сжатия: ${(uint8.length / (1024 * 1024)).toFixed(2)} MB`);

        const resultBuffer = new ArrayBuffer(uint8.length);
        new Uint8Array(resultBuffer).set(uint8);

        self.postMessage({ type: 'SUCCESS', arrayBuffer: resultBuffer, originalName: file.name }, [resultBuffer]);

    } catch (err) {
        const errorMsg = err && err.message ? err.message : String(err);
        sendLog(`🔥 КРИТИЧЕСКАЯ ОШИБКА: ${errorMsg}`);
        self.postMessage({ type: 'ERROR', message: `Сбой сжатия: ${errorMsg}` });
    }
};