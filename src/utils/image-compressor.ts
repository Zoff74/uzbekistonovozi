// src/utils/image-compressor.ts

export const compressImage = (file: File): Promise<File> => {
    return new Promise((resolve) => {
        if (!file || !file.type.startsWith('image/')) {
            return resolve(file);
        }

        const reader = new FileReader();
        reader.readAsDataURL(file);
        
        reader.onerror = () => resolve(file);

        reader.onload = (event) => {
            const img = document.createElement('img');
            img.src = event.target?.result as string;

            img.onerror = () => resolve(file);

            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                const MAX_SIZE = 1200;

                if (width > height) {
                    if (width > MAX_SIZE) {
                        height *= MAX_SIZE / width;
                        width = MAX_SIZE;
                    }
                } else {
                    if (height > MAX_SIZE) {
                        width *= MAX_SIZE / height;
                        height = MAX_SIZE;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                
                if (!ctx) {
                    return resolve(file);
                }

                ctx.drawImage(img, 0, 0, width, height);

                const mimeType = file.type; 

                canvas.toBlob((blob) => {
                    if (!blob) {
                        return resolve(file);
                    }
                    
                    const compressedFile = new File([blob], file.name, {
                        type: mimeType,
                        lastModified: Date.now(),
                    });

                    console.log(`🖼 Сжатие фото: ${(file.size / 1024).toFixed(1)} КБ -> ${(compressedFile.size / 1024).toFixed(1)} КБ`);

                    resolve(compressedFile);
                }, mimeType, 0.75);
            };
        };
    });
};

interface VideoValidationResult {
    isValid: boolean;
    error?: string;
}

/**
 * Валидация видеофайла перед загрузкой в ImageKit
 * Проверяет: формат, максимальный вес (до 100 МБ) и длительность (до 5 минут)
 */
export const validateVideoFile = (file: File): Promise<VideoValidationResult> => {
    return new Promise((resolve) => {
        if (!file) {
            return resolve({ isValid: false, error: "Файл не выбран" });
        }

        const validTypes = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v', 'video/x-matroska'];
        if (!validTypes.includes(file.type) && !file.name.endsWith('.mkv')) {
            return resolve({ 
                isValid: false, 
                error: "Недопустимый формат видео. Используйте MP4, MOV, WEBM или MKV." 
            });
        }

        // Жесткий лимит 100 МБ
        const MAX_SIZE_MB = 100;
        const maxSizeInBytes = MAX_SIZE_MB * 1024 * 1024;
        if (file.size > maxSizeInBytes) {
            return resolve({ 
                isValid: false, 
                error: `Видео слишком тяжелое (${(file.size / (1024 * 1024)).toFixed(1)} МБ). Максимальный размер — ${MAX_SIZE_MB} МБ.` 
            });
        }

        const videoElement = document.createElement('video');
        videoElement.preload = 'metadata';

        videoElement.onloadedmetadata = () => {
            window.URL.revokeObjectURL(videoElement.src);
            const durationInSeconds = videoElement.duration;
            const MAX_DURATION_MINUTES = 10;
            const maxDurationInSeconds = MAX_DURATION_MINUTES * 60;

            if (durationInSeconds > maxDurationInSeconds) {
                const actualMinutes = (durationInSeconds / 60).toFixed(1);
                return resolve({ 
                    isValid: false, 
                    error: `Видео слишком длинное (${actualMinutes} мин.). Максимальная длительность клипа — ${MAX_DURATION_MINUTES} минут.` 
                });
            }

            resolve({ isValid: true });
        };

        videoElement.onerror = () => {
            window.URL.revokeObjectURL(videoElement.src);
            resolve({ 
                isValid: false, 
                error: "Не удалось прочитать файл видео. Возможно, он поврежден." 
            });
        };

        videoElement.src = URL.createObjectURL(file);
    });
};