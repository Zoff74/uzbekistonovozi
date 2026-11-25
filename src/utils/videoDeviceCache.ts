// src/utils/videoDeviceCache.ts
const DB_NAME = "uzbekistonovozi-permanent-videos";
const DB_VERSION = 2;
const STORE_NAME = "videos";
const PARTIAL_STORE_NAME = "partial_chunks";
interface StoredVideoRecord { id: string; blob: Blob; size: number; mimeType: string; savedAt: number; }
interface PartialChunkRecord { key: string; trackId: string; index: number; data: Uint8Array; totalLength: number; mimeType: string; }
const activeBackgroundDownloads = new Map<string, Promise<void>>();
const activePreplayDownloads = new Map<string, Promise<{ src: string; fromCache: boolean }>>();
function normalizeVideoMimeType(rawMime?: string): string {
  const cleaned = (rawMime || "").trim().toLowerCase();
  return !cleaned || cleaned === "application/octet-stream" ? "video/mp4" : cleaned;
}
function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !navigator.storage?.persist) return false;
    if (navigator.storage.persisted && (await navigator.storage.persisted())) return true;
    const granted = await navigator.storage.persist();
    console.info(`🛡️ [VIDEO CACHE] Persistent storage: ${granted ? "разрешено" : "не подтверждено браузером"}`);
    return granted;
  } catch { return false; }
}
function openVideoDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("IndexedDB не поддерживается")); return; }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: "id" });
      if (!db.objectStoreNames.contains(PARTIAL_STORE_NAME)) {
        const partialStore = db.createObjectStore(PARTIAL_STORE_NAME, { keyPath: "key" });
        partialStore.createIndex("by_track", "trackId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function getVideoFromIndexedDB(id: string): Promise<Blob | null> {
  try {
    console.info(`🔎 [VIDEO CACHE] Поиск в IndexedDB по id="${id}"...`);
    const db = await openVideoDB();
    return await new Promise((resolve) => {
      const req = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(id);
      req.onsuccess = () => {
        const rec = req.result as StoredVideoRecord | undefined;
        if (rec?.blob && rec.blob.size > 1024) {
          console.info(`📦 [VIDEO CACHE] Найдено в IndexedDB id="${id}" (${(rec.blob.size / 1024 / 1024).toFixed(2)} МБ)`);
          resolve(rec.blob);
        } else {
          console.info(`📭 [VIDEO CACHE] В IndexedDB нет готового видео для id="${id}"`);
          resolve(null);
        }
      };
      req.onerror = () => { console.warn(`⚠️ [VIDEO CACHE] Ошибка чтения IndexedDB для id="${id}"`); resolve(null); };
    });
  } catch (err) { console.warn(`⚠️ [VIDEO CACHE] Сбой getVideoFromIndexedDB id="${id}":`, err); return null; }
}
async function saveVideoToIndexedDB(id: string, blob: Blob, mimeType: string): Promise<boolean> {
  try {
    await requestPersistentStorage();
    const db = await openVideoDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const req = tx.objectStore(STORE_NAME).put({ id, blob, size: blob.size, mimeType: normalizeVideoMimeType(mimeType || blob.type), savedAt: Date.now() } as StoredVideoRecord);
      req.onsuccess = () => resolve(true);
      req.onerror = (e) => { console.error("⚠️ [VIDEO CACHE] Ошибка записи в IndexedDB:", e); resolve(false); };
    });
  } catch (err) { console.error("⚠️ [VIDEO CACHE] Сбой IndexedDB:", err); return false; }
}
async function clearPartialChunksFromDB(trackId: string): Promise<void> {
  try {
    const db = await openVideoDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(PARTIAL_STORE_NAME, "readwrite");
      const store = tx.objectStore(PARTIAL_STORE_NAME);
      const req = store.index("by_track").getAllKeys(trackId);
      req.onsuccess = () => { for (const k of req.result || []) store.delete(k); };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {}
}
async function getVideoFromOPFS(id: string): Promise<File | null> {
  try {
    if (typeof navigator === "undefined" || !navigator.storage?.getDirectory) { console.info(`ℹ️ [VIDEO CACHE] OPFS недоступен в браузере`); return null; }
    console.info(`🔎 [VIDEO CACHE] Поиск в OPFS: uzov_video_${id}.mp4...`);
    const root = await navigator.storage.getDirectory();
    const file = await (await root.getFileHandle(`uzov_video_${id}.mp4`, { create: false })).getFile();
    if (file && file.size > 1024) {
      console.info(`📁 [VIDEO CACHE] Найдено в OPFS: uzov_video_${id}.mp4 (${(file.size / 1024 / 1024).toFixed(2)} МБ)`);
      return file;
    }
    console.info(`📭 [VIDEO CACHE] Файл в OPFS пуст или меньше 1 КБ: uzov_video_${id}.mp4`);
    return null;
  } catch { console.info(`📭 [VIDEO CACHE] Файл не найден в OPFS: uzov_video_${id}.mp4`); return null; }
}
async function saveVideoToOPFS(id: string, blob: Blob): Promise<boolean> {
  try {
    await requestPersistentStorage();
    if (typeof navigator === "undefined" || !navigator.storage?.getDirectory) return false;
    const root = await navigator.storage.getDirectory();
    const fileHandle = await root.getFileHandle(`uzov_video_${id}.mp4`, { create: true });
    if (typeof (fileHandle as any).createWritable !== "function") return false;
    const writable = await (fileHandle as any).createWritable();
    await writable.write(blob);
    await writable.close();
    const saved = await getVideoFromOPFS(id);
    return Boolean(saved && saved.size === blob.size);
  } catch { return false; }
}
async function streamFileToOPFS(id: string, file: File): Promise<boolean> {
  try {
    await requestPersistentStorage();
    if (typeof navigator === "undefined" || !navigator.storage?.getDirectory || typeof file.stream !== "function") return false;
    const root = await navigator.storage.getDirectory();
    const fileHandle = await root.getFileHandle(`uzov_video_${id}.mp4`, { create: true });
    if (typeof (fileHandle as any).createWritable !== "function") return false;
    const writable = await (fileHandle as any).createWritable();
    const reader = file.stream().getReader();
    let pos = 0, step = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value && value.byteLength > 0) {
          await writable.write({ type: "write", position: pos, data: value });
          pos += value.byteLength;
          if (++step % 16 === 0) await yieldToMain();
        }
      }
      if (file.size > 0 && pos !== file.size) throw new Error(`Неполная запись файла в OPFS: ${pos} != ${file.size}`);
      await writable.close();
      const verified = await getVideoFromOPFS(id);
      return Boolean(verified && (file.size <= 0 || verified.size === file.size));
    } catch (err) {
      await writable.close().catch(() => {});
      await root.removeEntry(`uzov_video_${id}.mp4`).catch(() => {});
      throw err;
    }
  } catch { return false; }
}
async function backgroundPersistToOPFS(cleanId: string, streamUrl: string, onProgress?: (percent: number) => void, externalSignal?: AbortSignal): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !navigator.storage?.getDirectory) return false;
    await requestPersistentStorage();
    const root = await navigator.storage.getDirectory();
    const tempName = `uzov_part_${cleanId}.mp4`;
    const finalName = `uzov_video_${cleanId}.mp4`;
    const tempHandle = await root.getFileHandle(tempName, { create: true });
    if (typeof (tempHandle as any).createWritable !== "function") { console.warn(`⚠️ [VIDEO CACHE] createWritable недоступен для OPFS (${cleanId})`); return false; }
    try { localStorage.removeItem(`uzov_meta_${cleanId}`); } catch {}
    await clearPartialChunksFromDB(cleanId);
    const writable = await (tempHandle as any).createWritable({ keepExistingData: false });
    let receivedBytes = 0, totalLength = 0, writeCounter = 0, lastLoggedMb = 0, completedCleanly = false;
    try {
      if (externalSignal?.aborted) throw new DOMException("Aborted", "AbortError");
      let stallTimer: ReturnType<typeof setTimeout> | null = null;
      const reqController = new AbortController();
      const onExternalAbort = () => reqController.abort();
      externalSignal?.addEventListener("abort", onExternalAbort, { once: true });
      const resetStallTimer = () => { if (stallTimer) clearTimeout(stallTimer); stallTimer = setTimeout(() => reqController.abort(), 30000); };
      try {
        resetStallTimer();
        console.info(`🌐 [VIDEO CACHE] Целевой последовательный запрос в OPFS: ${streamUrl}`);
        const res = await fetch(streamUrl, { cache: "no-store", signal: reqController.signal });
        console.info(`📡 [VIDEO CACHE] Ответ fetch (${cleanId}): HTTP ${res.status}, Content-Length=${res.headers.get("Content-Length") || "?"}, X-Total-Size=${res.headers.get("X-Total-Size") || "?"}`);
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
        totalLength = Number(res.headers.get("X-Total-Size") || res.headers.get("Content-Length") || 0);
        const reader = res.body.getReader();
        let firstChunkLogged = false;
        while (true) {
          resetStallTimer();
          const { done, value } = await reader.read();
          if (done) {
            if (totalLength > 0 && receivedBytes !== totalLength) throw new Error(`Поток прерван до конца файла: ${receivedBytes}/${totalLength} байт`);
            completedCleanly = receivedBytes > 1024;
            break;
          }
          if (!value || value.byteLength === 0) continue;
          if (!firstChunkLogged) { firstChunkLogged = true; console.info(`📦 [VIDEO CACHE] Первый чанк получен для id="${cleanId}" (${value.byteLength} байт)`); }
          let chunk = value;
          if (totalLength > 0) {
            const needed = totalLength - receivedBytes;
            if (needed <= 0) { await reader.cancel().catch(() => {}); completedCleanly = true; break; }
            if (chunk.length > needed) chunk = chunk.subarray(0, needed);
          }
          await writable.write({ type: "write", position: receivedBytes, data: chunk });
          receivedBytes += chunk.byteLength;
          if (++writeCounter % 16 === 0) await yieldToMain();
          const currentMbBucket = Math.floor(receivedBytes / (5 * 1024 * 1024));
          if (currentMbBucket > lastLoggedMb) {
            lastLoggedMb = currentMbBucket;
            console.info(`⏳ [VIDEO CACHE] Прогресс OPFS id="${cleanId}": ${(receivedBytes / 1024 / 1024).toFixed(1)} МБ${totalLength > 0 ? ` / ${(totalLength / 1024 / 1024).toFixed(1)} МБ (${Math.round((receivedBytes / totalLength) * 100)}%)` : ""}`);
          }
          if (totalLength > 0) {
            onProgress?.(Math.min(99.9999, (receivedBytes / totalLength) * 100));
            if (receivedBytes >= totalLength) { await reader.cancel().catch(() => {}); completedCleanly = true; break; }
          } else { onProgress?.(Math.min(95, 10 + (receivedBytes / (1024 * 1024)) * 2)); }
        }
      } finally { externalSignal?.removeEventListener("abort", onExternalAbort); if (stallTimer) clearTimeout(stallTimer); }
      await writable.close();
    } catch (err) {
      await writable.close().catch(() => {});
      await root.removeEntry(tempName).catch(() => {});
      throw err;
    }
    if (!completedCleanly || receivedBytes <= 1024 || (totalLength > 0 && receivedBytes !== totalLength)) {
      await root.removeEntry(tempName).catch(() => {});
      return false;
    }
    if (typeof (tempHandle as any).move === "function") await (tempHandle as any).move(finalName);
    else {
      const completedFile = await tempHandle.getFile();
      const finalWritable = await (await root.getFileHandle(finalName, { create: true }) as any).createWritable();
      await finalWritable.write(completedFile);
      await finalWritable.close();
      await root.removeEntry(tempName).catch(() => {});
    }
    const readyFile = await getVideoFromOPFS(cleanId);
    if (readyFile && (totalLength <= 0 || readyFile.size === totalLength)) {
      console.info(`💾 [VIDEO CACHE] Сохранено в OPFS: ${cleanId} (${(readyFile.size / 1024 / 1024).toFixed(2)} МБ)`);
      onProgress?.(100);
      return true;
    }
    await root.removeEntry(finalName).catch(() => {});
    return false;
  } catch (err: any) {
    if (err?.name === "AbortError") { console.info(`🛑 [VIDEO CACHE] Загрузка OPFS отменена для id="${cleanId}"`); throw err; }
    console.warn(`⚠️ [VIDEO CACHE] Ошибка backgroundPersistToOPFS для id="${cleanId}":`, err?.message || err);
    return false;
  }
}
async function backgroundPersistToIndexedDB(cleanId: string, streamUrl: string, onProgress?: (percent: number) => void, externalSignal?: AbortSignal): Promise<boolean> {
  try {
    console.info(`⬇️ [VIDEO CACHE] Переход к целостной загрузке в IndexedDB для id="${cleanId}"`);
    await clearPartialChunksFromDB(cleanId);
    const chunks: Uint8Array[] = [];
    let receivedBytes = 0, totalLength = 0, contentType = "video/mp4", completedCleanly = false;
    if (externalSignal?.aborted) throw new DOMException("Aborted", "AbortError");
    let stallTimer: ReturnType<typeof setTimeout> | null = null;
    const reqController = new AbortController();
    const onExternalAbort = () => reqController.abort();
    externalSignal?.addEventListener("abort", onExternalAbort, { once: true });
    const resetStallTimer = () => { if (stallTimer) clearTimeout(stallTimer); stallTimer = setTimeout(() => reqController.abort(), 30000); };
    try {
      resetStallTimer();
      console.info(`🌐 [VIDEO CACHE] Целевой последовательный запрос в IndexedDB: ${streamUrl}`);
      const res = await fetch(streamUrl, { cache: "no-store", signal: reqController.signal });
      console.info(`📡 [VIDEO CACHE] Ответ fetch IDB (${cleanId}): HTTP ${res.status}`);
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      totalLength = Number(res.headers.get("X-Total-Size") || res.headers.get("Content-Length") || 0);
      contentType = normalizeVideoMimeType(res.headers.get("Content-Type") || "video/mp4");
      const reader = res.body.getReader();
      let step = 0;
      while (true) {
        resetStallTimer();
        const { done, value } = await reader.read();
        if (done) {
          if (totalLength > 0 && receivedBytes !== totalLength) throw new Error(`Поток IDB прерван до конца: ${receivedBytes}/${totalLength} байт`);
          completedCleanly = receivedBytes > 1024;
          break;
        }
        if (!value || value.byteLength === 0) continue;
        let chunk = value;
        if (totalLength > 0) {
          const needed = totalLength - receivedBytes;
          if (needed <= 0) { await reader.cancel().catch(() => {}); completedCleanly = true; break; }
          if (chunk.length > needed) chunk = chunk.subarray(0, needed);
        }
        const copy = new Uint8Array(chunk);
        chunks.push(copy);
        receivedBytes += copy.byteLength;
        if (++step % 24 === 0) await yieldToMain();
        if (totalLength > 0) {
          onProgress?.(Math.min(99.9999, (receivedBytes / totalLength) * 100));
          if (receivedBytes >= totalLength) { await reader.cancel().catch(() => {}); completedCleanly = true; break; }
        } else { onProgress?.(Math.min(95, 10 + (receivedBytes / (1024 * 1024)) * 2)); }
      }
    } finally { externalSignal?.removeEventListener("abort", onExternalAbort); if (stallTimer) clearTimeout(stallTimer); }
    if (!completedCleanly || receivedBytes <= 1024) return false;
    const finalBlob = new Blob(chunks as unknown as BlobPart[], { type: contentType });
    if (totalLength > 0 && finalBlob.size !== totalLength) {
      console.warn(`⚠️ [VIDEO CACHE] Размер блоба IDB (${finalBlob.size}) != totalLength (${totalLength}) для id="${cleanId}"`);
      return false;
    }
    await saveVideoToIndexedDB(cleanId, finalBlob, contentType);
    console.info(`💾 [VIDEO CACHE] Сохранено в IndexedDB: ${cleanId} (${(finalBlob.size / 1024 / 1024).toFixed(2)} МБ)`);
    onProgress?.(100);
    return true;
  } catch (err: any) {
    if (err?.name === "AbortError") throw err;
    console.warn(`⚠️ [VIDEO CACHE] Ошибка backgroundPersistToIndexedDB для id="${cleanId}":`, err?.message || err);
    return false;
  }
}
export async function downloadVideoBeforePlayback(trackId: string, signal: AbortSignal, onProgress?: (percent: number) => void): Promise<{ src: string; fromCache: boolean }> {
  const cleanId = String(trackId || "").trim();
  const streamUrl = `/api/videos/stream/${cleanId}`;
  console.info(`🚀 [VIDEO CACHE] downloadVideoBeforePlayback старт: cleanId="${cleanId}", streamUrl="${streamUrl}"`);
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  await requestPersistentStorage();
  const opfsFile = await getVideoFromOPFS(cleanId);
  if (opfsFile) {
    const blobUrl = URL.createObjectURL(opfsFile);
    console.info(`✅ [VIDEO CACHE] Запуск с диска (OPFS): ${cleanId} -> ${blobUrl}`);
    onProgress?.(100);
    return { src: blobUrl, fromCache: true };
  }
  const cachedBlob = await getVideoFromIndexedDB(cleanId);
  if (cachedBlob) {
    const blobUrl = URL.createObjectURL(cachedBlob);
    console.info(`✅ [VIDEO CACHE] Запуск с диска (IndexedDB): ${cleanId} -> ${blobUrl}`);
    onProgress?.(100);
    return { src: blobUrl, fromCache: true };
  }
  const existingJob = activePreplayDownloads.get(cleanId);
  if (existingJob) { console.info(`🔁 [VIDEO CACHE] Подключаемся к активной загрузке для id="${cleanId}"`); return existingJob; }
  const downloadJob = (async (): Promise<{ src: string; fromCache: boolean }> => {
    try {
      if (await backgroundPersistToOPFS(cleanId, streamUrl, onProgress, signal)) {
        const readyOpfs = await getVideoFromOPFS(cleanId);
        if (readyOpfs) return { src: URL.createObjectURL(readyOpfs), fromCache: true };
      }
      if (await backgroundPersistToIndexedDB(cleanId, streamUrl, onProgress, signal)) {
        const readyIdb = await getVideoFromIndexedDB(cleanId);
        if (readyIdb) return { src: URL.createObjectURL(readyIdb), fromCache: true };
      }
      throw new Error("Не удалось сохранить видеофайл на устройство перед воспроизведением");
    } finally { activePreplayDownloads.delete(cleanId); }
  })();
  activePreplayDownloads.set(cleanId, downloadJob);
  return downloadJob;
}
function triggerBackgroundDiskCache(cleanId: string, streamUrl: string, onProgress?: (percent: number) => void): void {
  if (activeBackgroundDownloads.has(cleanId)) return;
  const job = (async () => {
    try {
      await yieldToMain();
      if (!(await backgroundPersistToOPFS(cleanId, streamUrl, onProgress))) await backgroundPersistToIndexedDB(cleanId, streamUrl, onProgress);
    } catch {} finally { activeBackgroundDownloads.delete(cleanId); }
  })();
  activeBackgroundDownloads.set(cleanId, job);
}
export async function startVideoStreamWithBackgroundCache(trackId: string, onProgress?: (percent: number) => void): Promise<{ src: string; fromCache: boolean }> {
  const cleanId = String(trackId).trim();
  const streamUrl = `/api/videos/stream/${cleanId}`;
  await requestPersistentStorage();
  const opfsFile = await getVideoFromOPFS(cleanId);
  if (opfsFile) { console.info(`✅ [VIDEO CACHE] Мгновенный запуск с диска (OPFS): ${cleanId}`); onProgress?.(100); return { src: URL.createObjectURL(opfsFile), fromCache: true }; }
  const cachedBlob = await getVideoFromIndexedDB(cleanId);
  if (cachedBlob) { console.info(`✅ [VIDEO CACHE] Мгновенный запуск с диска (IndexedDB): ${cleanId}`); onProgress?.(100); return { src: URL.createObjectURL(cachedBlob), fromCache: true }; }
  triggerBackgroundDiskCache(cleanId, streamUrl, onProgress);
  return { src: streamUrl, fromCache: false };
}
export async function loadVideoToDevice(trackId: string, signal: AbortSignal, onProgress: (percent: number) => void): Promise<string> {
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  return (await downloadVideoBeforePlayback(trackId, signal, onProgress)).src;
}
export async function precacheUploadedVideo(trackId: string, file: File): Promise<void> {
  const cleanId = String(trackId || "").trim();
  if (!cleanId || !file || file.size <= 1024) return;
  if (!(await streamFileToOPFS(cleanId, file)) && !(await saveVideoToOPFS(cleanId, file))) {
    await saveVideoToIndexedDB(cleanId, file, normalizeVideoMimeType(file.type));
  }
  console.info(`⚡ [VIDEO CACHE] Загруженное автором видео сохранено в локальный кэш: ${cleanId}`);
}
export async function getLocalVideoUrl(trackId: string): Promise<string | null> {
  const cleanId = String(trackId || "").trim();
  if (!cleanId) return null;
  await requestPersistentStorage();
  const opfsFile = await getVideoFromOPFS(cleanId);
  if (opfsFile) return URL.createObjectURL(opfsFile);
  const cachedBlob = await getVideoFromIndexedDB(cleanId);
  if (cachedBlob) return URL.createObjectURL(cachedBlob);
  return null;
}
export function revokeLocalVideoUrl(url: string | null | undefined): void {
  if (url && url.startsWith("blob:")) { try { URL.revokeObjectURL(url); } catch {} }
}