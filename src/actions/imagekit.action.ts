"use server";
import ImageKit from "@imagekit/nodejs";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth.config";
import crypto from "crypto";
import { dbConnect } from "@/lib/mongoose";
import User from "@/models/User";

function universalSlugify(str: string): string {
    return str
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "");
}

interface UploadResult {
    success: boolean;
    error?: string;
    fileId?: string;
    filePath?: string;
    url?: string;
}

async function getSessionUserId() {
    const session = await getServerSession(authOptions);
    return session?.user?.id || null;
}

const PRIVATE_KEY = process.env.IMAGEKIT_PRIVATE_KEY;
const PUBLIC_KEY = process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY;
const URL_ENDPOINT = process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT;
const MAIN_FOLDER = process.env.NEXT_PUBLIC_IMAGEKIT_FOLDER || "";

if (!PRIVATE_KEY) {
    console.error("ОШИБКА КОНФИГУРАЦИИ: IMAGEKIT_PRIVATE_KEY отсутствует в переменных окружения.");
}

const imagekit = new ImageKit({
    privateKey: PRIVATE_KEY as string,
});

export async function getImageKitAuth() {
    try {
        const token = crypto.randomUUID();
        const expire = Math.floor(Date.now() / 1000) + 2400;
        
        const signature = crypto
            .createHmac("sha1", PRIVATE_KEY || "")
            .update(token + expire)
            .digest("hex");

        return {
            token,
            expire,
            signature,
            publicKey: PUBLIC_KEY,
            urlEndpoint: URL_ENDPOINT,
        };
    } catch (error) {
        return { error: "ImageKit Auth Failed" };
    }
}

export async function uploadImageBase64(fileData: string, fileName: string, folderPath: string): Promise<UploadResult> {
    try {
        if (!PRIVATE_KEY) {
            return { success: false, error: "Критическая ошибка: Приватный ключ ImageKit не загружен." };
        }
        
        if (fileData.length > 160000000) { 
            return { success: false, error: "Файл превышает лимит размера (максимум 120 МБ)." };
        }

        const cleanSubFolder = folderPath.startsWith('/') ? folderPath.substring(1) : folderPath;
        const finalFolder = MAIN_FOLDER ? `${MAIN_FOLDER}/${cleanSubFolder}` : cleanSubFolder;

        const lastDotIndex = fileName.lastIndexOf('.');
        const extension = lastDotIndex !== -1 ? fileName.substring(lastDotIndex + 1) : 'jpg';
        const baseName = lastDotIndex !== -1 ? fileName.substring(0, lastDotIndex) : fileName;

        const safeBaseName = universalSlugify(baseName);
        const finalBaseName = safeBaseName.length > 0 ? safeBaseName : "file";
        const finalFileName = `${Date.now()}_${finalBaseName}.${extension}`;

        let base64Data = fileData.replace(/^data:(image|video|audio)\/(?:png|jpeg|webp|gif|svg|mp4|webm|ogg|mp3|wav|aac|quicktime)\S*;base64,/, "");

        if (base64Data === fileData) {
            const parts = fileData.split(';base64,');
            if (parts.length > 1) {
                base64Data = parts[1];
            } else if (fileData.startsWith('data:image/') || fileData.startsWith('data:video/') || fileData.startsWith('data:audio/')) {
                base64Data = fileData.substring(fileData.indexOf(',') + 1);
            }
        }

        const base64DataToSend = base64Data.replace(/\s/g, '');

        const response: any = await imagekit.files.upload({ 
            file: base64DataToSend,
            fileName: finalFileName,
            folder: finalFolder,
        });

        if (!response.fileId || !response.filePath) { 
            return { success: false, error: "Загрузка не подтверждена: ImageKit не вернул ID файла." };
        }

        return { 
            success: true, 
            fileId: response.fileId,
            url: response.url,
            filePath: response.filePath, 
        };

    } catch (error) {
        const errorDetails = (error as any)?.message || "Неизвестная ошибка ImageKit API";
        return { success: false, error: `Ошибка ImageKit: ${errorDetails}` };
    }
}

export async function deleteFileByFileId(fileId: string): Promise<{ success: boolean; error?: string }> {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return { success: false, error: "Пользователь не аутентифицирован." };
        }

        await imagekit.files.delete(fileId);
        return { success: true };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('404')) {
            return { success: true };
        }
        return { success: false, error: "Не удалось удалить файл." };
    }
}

/**
 * Атомарное обновление аватара:
 * 1. Берет ID текущего юзера из сессии.
 * 2. Достает старый `imageFileId` из базы (модель User).
 * 3. Физически удаляет старый файл из ImageKit.
 * 4. Загружает новый файл в папку avatars.
 * 5. Сохраняет новые `image` и `imageFileId` в базу по неизменяемому ID.
 */
export async function updateAvatarAction(fileData: string, fileName: string): Promise<UploadResult> {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return { success: false, error: "Требуется авторизация." };
        }

        await dbConnect();

        const currentUser = await User.findById(userId).select("imageFileId");

        if (currentUser && currentUser.imageFileId) {
            try {
                await imagekit.files.delete(currentUser.imageFileId);
            } catch (delErr) {
                console.warn("Старый аватар в ImageKit не найден или уже удален:", delErr);
            }
        }

        // 👈 ЖЕСТКО УКАЗЫВАЕМ ПАПКУ АВАТАРОВ
        const cleanSubFolder = "avatars";
        const finalFolder = MAIN_FOLDER ? `${MAIN_FOLDER}/${cleanSubFolder}` : cleanSubFolder;

        const cleanFileName = fileName.split('?')[0];
        const lastDotIndex = cleanFileName.lastIndexOf('.');
        let extension = lastDotIndex !== -1 ? cleanFileName.substring(lastDotIndex + 1).toLowerCase() : "jpg";
        
        if (extension.length > 5 || !['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(extension)) {
            extension = "webp";
        }

        const baseName = lastDotIndex !== -1 ? cleanFileName.substring(0, lastDotIndex) : cleanFileName;
        const safeBaseName = universalSlugify(baseName);
        const finalBaseName = safeBaseName.length > 0 ? safeBaseName : "avatar";
        
        const finalFileName = `avatar_${userId}_${Date.now()}_${finalBaseName}.${extension}`;

        let base64Data = fileData.replace(/^data:image\/\S+;base64,/, "");
        const base64DataToSend = base64Data.replace(/\s/g, '');

        const response: any = await imagekit.files.upload({ 
            file: base64DataToSend,
            fileName: finalFileName,
            folder: finalFolder, // 👈 Улетает в папку avatars
        });

        if (!response.fileId || !response.url) {
            return { success: false, error: "ImageKit не вернул данные файла." };
        }

        await User.findByIdAndUpdate(userId, {
            image: response.url,
            imageFileId: response.fileId
        });

        return { 
            success: true, 
            fileId: response.fileId,
            url: response.url,
            filePath: response.filePath, 
        };

    } catch (error) {
        const errorDetails = (error as any)?.message || "Ошибка при обновлении аватара";
        return { success: false, error: errorDetails };
    }
}