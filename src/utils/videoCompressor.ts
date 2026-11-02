// Полный клиентский файл для запуска видеокомпрессии в воркере

export async function compressVideoOnClient(
    file: File,
    onProgress?: (progress: number) => void
): Promise<File> {
    return new Promise(async (resolve, reject) => {
        let worker: Worker;
        try {
            // Добавляем ?v=2, чтобы гарантированно обойти кэш браузера для воркера
            worker = new Worker('/workers/compressionWorker.js?v=2');
        } catch (err) {
            console.error("Ошибка создания Worker:", err);
            return reject(err);
        }

        try {
            // Читаем файл в ArrayBuffer на главном потоке перед отправкой в воркер
            const arrayBuffer = await file.arrayBuffer();
            
            // Передаем буфер и метаданные, используя transferable objects для производительности
            worker.postMessage(
                { 
                    arrayBuffer: arrayBuffer, 
                    name: file.name, 
                    size: file.size 
                },
                [arrayBuffer]
            );
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
                const blob = new Blob([arrayBuffer], { type: "video/mp4" });
                const newFileName = originalName.replace(/\.[^/.]+$/, "") + ".mp4";
                resolve(new File([blob], newFileName, { type: "video/mp4" }));
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