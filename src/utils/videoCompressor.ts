export async function compressVideoOnClient(
    file: File,
    onProgress?: (progress: number) => void
): Promise<File> {
    return new Promise((resolve, reject) => {
        // Создаем воркер
        const worker = new Worker(new URL('/public/workers/compressionWorker.js', import.meta.url));

        worker.postMessage({ file });

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