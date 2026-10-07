"use server";
// src\actions\image.action.ts
import { uploadImageBase64 as uploadImageBase64Raw } from "@/actions/imagekit.action"; 
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth.config";

// Расширенный интерфейс для возвращаемого результата
interface UploadResultWithId {
    success: boolean;
    error?: string;
    url?: string;
    fileId?: string;
}

/**
 * @description Получает ID пользователя из сессии Auth.js.
 * @returns {Promise<string | null>} ID пользователя или null.
 */
async function getSessionUserId() {
    const session = await getServerSession(authOptions);
    return session?.user?.id || null;
}

/**
 * Загружает изображение в ImageKit.io, принимая Base64-строку и тип изображения.
 * @param fileBase64 Base64-строка изображения, включая префикс.
 * @param fileName Имя файла.
 * @param imageType Тип изображения для определения папки ('post' или 'avatar').
 * @returns Объект с success: true, url И fileId, или success: false и ошибкой.
 */
export async function uploadImage(fileBase64: string, fileName: string, imageType: 'post' | 'avatar'): Promise<UploadResultWithId> {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return { success: false, error: "Пользователь не аутентифицирован." };
        }

        if (!fileBase64 || !fileName) {
            return { success: false, error: "Отсутствуют данные файла или имя файла." };
        }

        let folderPath: string;
        if (imageType === 'post') {
            folderPath = "postimages";
        } else if (imageType === 'avatar') {
            folderPath = "avatars";
        } else {
            console.error("Критическая ошибка: imageType не 'post' и не 'avatar'. Получено:", imageType);
            return { success: false, error: "Недопустимый тип изображения. Убедитесь, что передан imageType='post' или 'avatar'." };
        }

        const result = await uploadImageBase64Raw(fileBase64, fileName, folderPath);

        if (result.success && result.url && result.fileId) {
            return { 
                success: true, 
                url: result.url,
                fileId: result.fileId,
            };
        } else {
            return { success: false, error: result.error || "Неизвестная ошибка загрузки ImageKit." };
        }

    } catch (error) {
        console.error("Ошибка загрузки изображения (обертка):", error);
        return { success: false, error: "Не удалось загрузить изображение." };
    }
}