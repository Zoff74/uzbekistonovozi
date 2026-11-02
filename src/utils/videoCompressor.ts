// src/utils/videoCompressor.ts

export async function compressVideoOnClient(
    file: File,
    onProgress?: (progress: number) => void
): Promise<File> {
    return new Promise(async (resolve, reject) => {
        let worker: Worker;
        try {
            const workerCode = `
                let ffmpegInstance = null;
                let lastSentTime = 0;

                function sendLog(text) {
                    console.log(text);
                    self.postMessage({ type: 'LOG', message: text });
                }

                self.onmessage = async (e) => {
                    // Принимаем напрямую arrayBuffer либо объект из сообщения
                    const payload = e.data || {};
                    const arrayBuffer = payload.arrayBuffer || (payload instanceof ArrayBuffer ? payload : null);
                    const name = payload.name || "video.mkv";
                    const size = payload.size || (arrayBuffer ? arrayBuffer.byteLength : 0);
                    
                    if (!arrayBuffer) {
                        sendLog("❌ Ошибка: Данные файла не переданы в воркер");
                        self.postMessage({ type: 'ERROR', message: 'Данные файла не переданы в воркер' });
                        return;
                    }

                    const fileSizeMB = (size / (1024 * 1024)).toFixed(2);
                    sendLog(\`🎬 Старт: \${name} (\${fileSizeMB} MB)\`);

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

                            const factoryCode = \`
                                var module = { exports: {} };
                                var exports = module.exports;
                                var define = undefined;
                                \${coreText}
                                return module.exports;
                            \`;

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
                                    console.log(\`[FFmpeg] \${text}\`);
                                },
                                printErr: (text) => {
                                    console.log(\`[FFmpeg err] \${text}\`);
                                    const timeMatch = text.match(/time=(\\d{2}):(\\d{2}):(\\d{2}\\.\\d{2})/);
                                    if (timeMatch) {
                                        const hours = parseFloat(timeMatch[1]);
                                        const minutes = parseFloat(timeMatch[2]);
                                        const seconds = parseFloat(timeMatch[3]);
                                        const currentTimeSec = hours * 3600 + minutes * 60 + seconds;

                                        const now = Date.now();
                                        if (now - lastSentTime > 300) {
                                            lastSentTime = now;
                                            const estimatedTotalSec = 45; 
                                            const percent = Math.min(Math.round((currentTimeSec / estimatedTotalSec) * 100), 95);
                                            self.postMessage({ type: 'PROGRESS', percent: percent > 0 ? percent : 5 });
                                        }
                                    }
                                }
                            });

                            sendLog("✅ Ядро FFmpeg успешно инициализировано");
                        }

                        const uniqueSuffix = Date.now();
                        const inputName = \`input_\${uniqueSuffix}.mkv\`;
                        const outputName = \`output_\${uniqueSuffix}.mp4\`;

                        sendLog("✍️ Запись полученного буфера в виртуальную файловую систему...");
                        const uint8Input = new Uint8Array(arrayBuffer);
                        ffmpegInstance.FS.writeFile(inputName, uint8Input);

                        const args = [
                            '-i', inputName,
                            '-threads', '4',
                            '-vf', "scale=-2:480",
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
                        sendLog(\`⚡ Сжатие завершено за \${(Date.now() - startTime) / 1000} сек.\`);

                        sendLog("📖 Чтение сжатого файла...");
                        const data = ffmpegInstance.FS.readFile(outputName);

                        sendLog("🧹 Очистка временных файлов...");
                        try { ffmpegInstance.FS.unlink(inputName); } catch (e) {}
                        try { ffmpegInstance.FS.unlink(outputName); } catch (e) {}

                        const resultBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
                        sendLog(\`📦 Итог сжатия: \${(resultBuffer.byteLength / (1024 * 1024)).toFixed(2)} MB\`);

                        self.postMessage({ type: 'SUCCESS', arrayBuffer: resultBuffer, originalName: name }, [resultBuffer]);

                    } catch (err) {
                        const errorMsg = err && err.message ? err.message : String(err);
                        sendLog(\`🔥 КРИТИЧЕСКАЯ ОШИБКА: \${errorMsg}\`);
                        self.postMessage({ type: 'ERROR', message: \`Сбой сжатия: \${errorMsg}\` });
                    }
                };
            `;

            const blob = new Blob([workerCode], { type: 'application/javascript' });
            const workerUrl = URL.createObjectURL(blob);
            worker = new Worker(workerUrl);
        } catch (err) {
            console.error("Ошибка создания Worker:", err);
            return reject(err);
        }

        try {
            const arrayBuffer = await file.arrayBuffer();
            // Убираем массив передачи прав [arrayBuffer], чтобы объект гарантированно клонировался без обнуления на клиенте
            worker.postMessage({ 
                arrayBuffer: arrayBuffer, 
                name: file.name, 
                size: file.size 
            });
        } catch (e) {
            worker.terminate();
            return reject(e);
        }

        worker.onmessage = (e) => {
            const { type, percent, arrayBuffer, originalName, message } = e.data;

            if (type === 'PROGRESS' && onProgress) {
                onProgress(percent);
            }

            if (type === 'SUCCESS') {
                worker.terminate();
                const outBlob = new Blob([arrayBuffer], { type: "video/mp4" });
                const newFileName = originalName.replace(/\.[^/.]+$/, "") + ".mp4";
                resolve(new File([outBlob], newFileName, { type: "video/mp4" }));
            }

            if (type === 'ERROR') {
                worker.terminate();
                reject(new Error(message));
            }

            if (type === 'LOG') {
                console.log(`[Worker Log]: ${message}`);
            }
        };

        worker.onerror = (err) => {
            worker.terminate();
            reject(err);
        };
    });
}