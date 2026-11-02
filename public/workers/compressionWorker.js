// public/workers/compressionWorker.js

let ffmpegInstance = null;
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
        if (!ffmpegInstance) {
            sendLog("⚙️ Загрузка локальных файлов ядра...");

            // Грузим core.js как текст
            const coreRes = await fetch('/workers/ffmpeg-core.js');
            if (!coreRes.ok) throw new Error("Не удалось загрузить /workers/ffmpeg-core.js");
            const coreText = await coreRes.text();

            // Грузим wasm как blob URL
            const wasmRes = await fetch('/workers/ffmpeg-core.wasm');
            if (!wasmRes.ok) throw new Error("Не удалось загрузить /workers/ffmpeg-core.wasm");
            const wasmBlob = await wasmRes.blob();
            const wasmURL = URL.createObjectURL(wasmBlob);

            // Создаем изолированную функцию фабрики ядра из текста core.js
            // Так как в конце файла есть module.exports = createFFmpegCore, мы подменяем модульное окружение
            const factoryCode = `
                var module = { exports: {} };
                var exports = module.exports;
                var define = undefined;
                ${coreText}
                return module.exports;
            `;

            const createFFmpegCore = new Function(factoryCode)();

            if (typeof createFFmpegCore !== 'function') {
                throw new Error("Не удалось инициализировать фабрику createFFmpegCore из файла");
            }

            sendLog("🚀 Инициализация Emscripten ядра...");
            ffmpegInstance = await createFFmpegCore({
                locateFile: (path) => {
                    if (path.endsWith('.wasm')) return wasmURL;
                    return path;
                },
                print: (text) => sendLog(`[FFmpeg] ${text}`),
                printErr: (text) => {
                    if (!text.includes("Aborted")) console.log(`[FFmpeg err] ${text}`);
                },
                progress: (p) => {
                    const now = Date.now();
                    if (now - lastSentTime > 500) {
                        lastSentTime = now;
                        const percent = Math.min(Math.round(p.progress * 100), 100);
                        self.postMessage({ type: 'PROGRESS', percent });
                    }
                }
            });

            sendLog("✅ Ядро FFmpeg успешно инициализировано");
        }

        const uniqueSuffix = Date.now();
        const inputName = `input_${uniqueSuffix}.mp4`;
        const outputName = `output_${uniqueSuffix}.mp4`;

        sendLog("📂 Чтение файла в память...");
        const arrayBufferData = await file.arrayBuffer();
        const uint8Input = new Uint8Array(arrayBufferData);

        sendLog("✍️ Запись файла в виртуальную файловую систему...");
        ffmpegInstance.FS.writeFile(inputName, uint8Input);

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

        sendLog("🔄 Запуск сжатия видео...");
        const startTime = Date.now();
        ffmpegInstance.exec(...args);
        sendLog(`⚡ Сжатие завершено за ${(Date.now() - startTime) / 1000} сек.`);

        sendLog("📖 Чтение сжатого файла...");
        const data = ffmpegInstance.FS.readFile(outputName);

        sendLog("🧹 Очистка временных файлов...");
        try { ffmpegInstance.FS.unlink(inputName); } catch (e) {}
        try { ffmpegInstance.FS.unlink(outputName); } catch (e) {}

        const resultBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
        sendLog(`📦 Итог сжатия: ${(resultBuffer.byteLength / (1024 * 1024)).toFixed(2)} MB`);

        self.postMessage({ type: 'SUCCESS', arrayBuffer: resultBuffer, originalName: file.name }, [resultBuffer]);

    } catch (err) {
        const errorMsg = err && err.message ? err.message : String(err);
        sendLog(`🔥 КРИТИЧЕСКАЯ ОШИБКА: ${errorMsg}`);
        self.postMessage({ type: 'ERROR', message: `Сбой сжатия: ${errorMsg}` });
    }
};