import ImageKit from "@imagekit/nodejs";
//src\lib\imagekit.ts
// --- 1. Инициализация ImageKit SDK для сервера ---
export function getImageKitInstance() {
  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;

  if (!privateKey) {
    throw new Error("Missing IMAGEKIT_PRIVATE_KEY environment variable");
  }

  return new ImageKit({
    privateKey,
  });
}

/**
 * @description Функция для удаления файла из ImageKit по его fileId (только для Server Actions).
 */
export async function deleteImageFromIK(fileId: string) {
  try {
    if (!fileId) return;
    const ik = getImageKitInstance();
    await ik.files.delete(fileId);
    console.log("Файл успешно удален из ImageKit, ID: " + fileId);
  } catch (error) {
    console.error("Ошибка при удалении файла из ImageKit:", error);
  }
}

// --- 2. Универсальная функция для формирования полного URL (для клиента и сервера) ---

const CDN_BASE_URL = process.env.IMAGEKIT_URL_ENDPOINT 
  ? process.env.IMAGEKIT_URL_ENDPOINT.split('?')[0] 
  : 'https://ik.imagekit.io/tyhsos05b';

/**
 * @description Функция для формирования полного, веб-доступного URL для изображений.
 */
export function getWebAccessiblePath(
  relativePath: string | undefined | null
): string | null {
  if (!relativePath) {
    return null;
  }

  if (relativePath.startsWith('http')) {
    return relativePath;
  }

  if (!CDN_BASE_URL) {
    return null;
  }

  const cleanPath = relativePath.startsWith('/') ? relativePath.substring(1) : relativePath;

  return CDN_BASE_URL + "/" + cleanPath;
}

// --- 3. Функция оптимизации и сжатия изображений на лету через ImageKit ---

export function getOptimizedImageUrl(url: string, width?: number, height?: number, quality = 65): string {
  if (!url || !url.includes('ik.imagekit.io')) return url;

  if (url.includes('tr=')) return url;

  const transformations: string[] = [`q-${quality}`, 'f-auto'];

  if (width) transformations.push(`w-${width}`);
  if (height) transformations.push(`h-${height}`);

  const parts = url.split(/ik\.imagekit.io\/[^/]+\//);
  if (parts.length !== 2) return url;

  const match = url.match(/ik\.imagekit.io\/([^/]+)\//);
  const endpointName = match ? match[1] : 'tyhsos05b';

  return `https://ik.imagekit.io/${endpointName}/tr:${transformations.join(',')}/${parts[1]}`;
}

// --- 4. Функция для видео (отдает чистый URL без трансформаций, чтобы не жрать лимиты) ---

export function getOptimizedVideoUrl(url: string, quality = 70): string {
  // Видео отдаем строго в чистом виде без каких-либо tr: параметров,
  // чтобы ImageKit не тратил лимиты бесплатного плана на конвертацию/сжатие.
  return url;
}