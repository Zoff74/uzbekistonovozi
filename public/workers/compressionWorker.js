// public/workers/compressionWorker.js

let ffmpegInstance = null;
let lastSentTime = 0;

function sendLog(text) {
    console.log(text);
    self.postMessage({ type: 'LOG', message: text });
}

// Универсальная функция для создания blob URL из локальных файлов ядра
async function loadCoreToBlob(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Не удалось загрузить ${url}: ${response.statusText}`);
    const blob = await response.blob();
    return URL.createObjectURL(blob);
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
            sendLog("⚙️ Инициализация FFmpeg в воркере...");

            // Загружаем ядро и WASM через fetch из папки /workers/
            const coreURL = await loadCoreToBlob('/workers/ffmpeg-core.js');
            const wasmURL = await loadCoreToBlob('/workers/ffmpeg-core.wasm');

            // Подгружаем скрипт ядра Emscripten прямо в воркер
            importScripts(coreURL);

            if (typeof createFFmpegCore === 'undefined') {
                throw new Error("createFFmpegCore не определен после импорта core.js");
            }

            sendLog("📥 Запуск Emscripten ядра...");
            ffmpegInstance = await createFFmpegCore({
                locateFile: (path) => {
                    if (path.endsWith('.wasm')) return wasmURL;
                    return path;
                },
                print: (text) => sendLog(`[FFmpeg stdout] ${text}`),
                printErr: (text) => {
                    // Игнорируем обычные логи stderr, которые FFmpeg шлет туда же
                    if (!text.includes("Aborted")) {
                        console.log(`[FFmpeg stderr] ${text}`);
                    }
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

        // Аргументы для сжатия
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