//src\utils\videoCompressor.ts
export async function compressVideoOnClient(
    file: File,
    onProgress?: (progress: number) => void
): Promise<File> {
    return new Promise(async (resolve, reject) => {
        let worker: Worker;
        try {
            worker = new Worker('/workers/compressionWorker.js');
        } catch (err) {
            console.error("Ошибка создания Worker:", err);
            return reject(err);
        }

        // Читаем файл в ArrayBuffer на клиенте перед отправкой в воркер
        try {
            const arrayBuffer = await file.arrayBuffer();
            worker.postMessage(
                { arrayBuffer, name: file.name, size: file.size },
                [arrayBuffer] // Передаем владение буфером без копирования для максимальной скорости
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
        };

        worker.onerror = (err) => {
            worker.terminate();
            reject(err);
        };
    });
}