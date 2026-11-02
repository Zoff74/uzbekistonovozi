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

            const coreRes = await fetch('/workers/ffmpeg-core.js');
            if (!coreRes.ok) throw new Error("Не удалось загрузить /workers/ffmpeg-core.js");
            const coreText = await coreRes.text();

            const wasmRes = await fetch('/workers/ffmpeg-core.wasm');
            if (!wasmRes.ok) throw new Error("Не удалось загрузить /workers/ffmpeg-core.wasm");
            const wasmBlob = await wasmRes.blob();
            const wasmURL = URL.createObjectURL(wasmBlob);

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
                print: (text) => {
                    console.log(`[FFmpeg] ${text}`);
                },
                printErr: (text) => {
                    // FFmpeg шлет весь прогресс сжатия в stderr (printErr)
                    console.log(`[FFmpeg err] ${text}`);

                    // Пытаемся вытащить время из логов для расчета прогресса (например: time=00:00:12.34)
                    const timeMatch = text.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
                    if (timeMatch) {
                        const hours = parseFloat(timeMatch[1]);
                        const minutes = parseFloat(timeMatch[2]);
                        const seconds = parseFloat(timeMatch[3]);
                        const currentTimeSec = hours * 3600 + minutes * 60 + seconds;

                        // Приблизительная оценка длительности файла (если передана или берется из метаданных)
                        // Если точной длительности нет, берем условные 60 секунд для теста шкалы, 
                        // либо делим текущее время на предполагаемую длительность.
                        // Здесь сделаем безопасный тик прогресса на основе логов:
                        const now = Date.now();
                        if (now - lastSentTime > 300) {
                            lastSentTime = now;
                            // Эмулируем плавный рост прогресса на основе секунд кодирования
                            // (каждые 10 секунд кодирования добавляют ~15% условного прогресса до 95%)
                            const estimatedTotalSec = 60; 
                            const percent = Math.min(Math.round((currentTimeSec / estimatedTotalSec) * 100), 95);
                            self.postMessage({ type: 'PROGRESS', percent: percent > 0 ? percent : 5 });
                        }
                    }
                },
                progress: (p) => {
                    const now = Date.now();
                    if (now - lastSentTime > 300) {
                        lastSentTime = now;
                        const rawP = p && typeof p.progress === 'number' ? p.progress : 0;
                        const percent = Math.min(Math.round(rawP * 100), 100);
                        if (percent > 0) {
                            self.postMessage({ type: 'PROGRESS', percent });
                        }
                    }
                }
            });

            sendLog("✅ Ядро FFmpeg успешно инициализировано");
        }

        const uniqueSuffix = Date.now();
        const inputName = `input_${uniqueSuffix}.mkv`; // Поддерживаем оригинальное расширение
        const outputName = `output_${uniqueSuffix}.mp4`;

        sendLog("📂 Чтение файла в память...");
        const arrayBufferData = await file.arrayBuffer();
        const uint8Input = new Uint8Array(arrayBufferData);

        sendLog("✍️ Запись файла в виртуальную файловую систему...");
        ffmpegInstance.FS.writeFile(inputName, uint8Input);

        const args = [
            '-i', inputName,
            '-threads', '4', // Задействуем потоки для ускорения
            '-vf', "scale=-2:480", // Упрощенный фильтр масштабирования по высоте 480p
            '-vcodec', 'libx264',
            '-b:v', '400k',
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