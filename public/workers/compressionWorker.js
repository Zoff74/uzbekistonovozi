importScripts('./ffmpeg.js');
importScripts('./ffmpeg-util.js');

let ffmpeg = null;
let lastSentTime = 0;

console.log("Worker [BOOT]: compressionWorker script loaded and initialized.");

self.onmessage = async (e) => {
    const file = e.data && e.data.file;
    
    if (!file) {
        console.error("Worker [ERROR]: No file received in message data.", e.data);
        self.postMessage({ type: 'ERROR', message: 'Воркер не получил файл для сжатия (file is undefined)' });
        return;
    }

    const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
    console.log(`Worker [START]: Processing file -> Name: "${file.name}", Size: ${fileSizeMB} MB, Type: "${file.type}"`);

    try {
        if (!ffmpeg) {
            console.log("Worker [FFMPEG]: Initializing new FFmpeg instance...");
            ffmpeg = new FFmpegWASM.FFmpeg();
            
            const baseURL = '/workers';
            console.log(`Worker [FFMPEG]: Asset base URL configured to "${baseURL}"`);
            
            ffmpeg.on('progress', ({ progress }) => {
                const now = Date.now();
                if (now - lastSentTime > 500) {
                    lastSentTime = now;
                    const percent = Math.min(Math.round(progress * 100), 100);
                    console.log(`Worker [PROGRESS]: Compression at ${percent}%`);
                    self.postMessage({ type: 'PROGRESS', percent });
                }
            });

            console.log("Worker [FFMPEG]: Generating BlobURLs for core and wasm binaries...");
            const coreURL = await FFmpegUtil.toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript');
            const wasmURL = await FFmpegUtil.toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm');
            console.log("Worker [FFMPEG]: BlobURLs generated successfully. Calling ffmpeg.load()...");

            await ffmpeg.load({ coreURL, wasmURL });
            console.log("Worker [FFMPEG]: FFmpeg loaded and ready successfully.");
        } else {
            console.log("Worker [FFMPEG]: Reusing existing initialized FFmpeg instance.");
        }

        const uniqueSuffix = Date.now();
        const inputName = `input_${uniqueSuffix}.mp4`;
        const outputName = `output_${uniqueSuffix}.mp4`;

        console.log(`Worker [FS]: Reading file into ArrayBuffer...`);
        const arrayBufferData = await file.arrayBuffer();
        console.log(`Worker [FS]: ArrayBuffer created. ByteLength: ${arrayBufferData.byteLength} bytes`);

        console.log(`Worker [FS]: Writing input file "${inputName}" to virtual filesystem...`);
        await ffmpeg.writeFile(inputName, new Uint8Array(arrayBufferData));
        console.log("Worker [FS]: Input file successfully written to virtual FS.");

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

        console.log("Worker [EXEC]: Starting FFmpeg execution with arguments:", args.join(' '));
        const startTime = Date.now();
        await ffmpeg.exec(args);
        console.log(`Worker [EXEC]: FFmpeg execution completed in ${(Date.now() - startTime) / 1000} seconds.`);

        console.log(`Worker [FS]: Reading output file "${outputName}" from virtual filesystem...`);
        const data = await ffmpeg.readFile(outputName);
        console.log(`Worker [FS]: Output read complete. Data length: ${data.length} bytes`);

        console.log("Worker [FS]: Cleaning up virtual filesystem temporary files...");
        await ffmpeg.deleteFile(inputName).catch((err) => console.warn("Worker [WARN]: Could not delete input file:", err));
        await ffmpeg.deleteFile(outputName).catch((err) => console.warn("Worker [WARN]: Could not delete output file:", err));

        const uint8 = new Uint8Array(data);
        const compressedSizeMB = (uint8.length / (1024 * 1024)).toFixed(2);
        console.log(`Worker [SUCCESS]: Compressed video ready. Final size: ${compressedSizeMB} MB`);

        const resultBuffer = new ArrayBuffer(uint8.length);
        new Uint8Array(resultBuffer).set(uint8);

        console.log("Worker [POST]: Sending SUCCESS message to main thread with Transferable Object.");
        self.postMessage({ type: 'SUCCESS', arrayBuffer: resultBuffer, originalName: file.name }, [resultBuffer]);

    } catch (err) {
        console.error("Worker [FATAL ERROR]: Caught exception in compression pipeline:", err);
        const errorDetails = {
            name: err && err.name ? err.name : 'UnknownError',
            message: err && err.message ? err.message : String(err),
            stack: err && err.stack ? err.stack : 'No stack trace available'
        };
        console.error("Worker [FATAL ERROR DETAILS]:", JSON.stringify(errorDetails, null, 2));
        
        self.postMessage({ 
            type: 'ERROR', 
            message: `Ошибка воркера [${errorDetails.name}]: ${errorDetails.message}` 
        });
    }
};