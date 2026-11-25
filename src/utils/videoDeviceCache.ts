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

async function requestPersistentStorage(): Promise<void> {
  try {
    if (typeof navigator !== "undefined" && navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch {}
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
    const db = await openVideoDB();
    return await new Promise((resolve) => {
      const req = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(id);
      req.onsuccess = () => { const rec = req.result as StoredVideoRecord | undefined; resolve(rec?.blob && rec.blob.size > 1024 ? rec.blob : null); };
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
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

async function loadPartialChunksFromDB(trackId: string): Promise<{ chunks: Uint8Array[]; receivedBytes: number; nextIndex: number; totalLength: number; mimeType: string }> {
  try {
    const db = await openVideoDB();
    return await new Promise((resolve) => {
      const req = db.transaction(PARTIAL_STORE_NAME, "readonly").objectStore(PARTIAL_STORE_NAME).index("by_track").getAll(trackId);
      req.onsuccess = () => {
        const records = ((req.result as PartialChunkRecord[]) || []).sort((a, b) => a.index - b.index);
        if (!records.length) { resolve({ chunks: [], receivedBytes: 0, nextIndex: 0, totalLength: 0, mimeType: "video/mp4" }); return; }
        const chunks: Uint8Array[] = [];
        let receivedBytes = 0;
        for (const rec of records) { chunks.push(rec.data); receivedBytes += rec.data.byteLength; }
        const last = records[records.length - 1];
        resolve({ chunks, receivedBytes, nextIndex: last.index + 1, totalLength: last.totalLength || 0, mimeType: normalizeVideoMimeType(last.mimeType) });
      };
      req.onerror = () => resolve({ chunks: [], receivedBytes: 0, nextIndex: 0, totalLength: 0, mimeType: "video/mp4" });
    });
  } catch { return { chunks: [], receivedBytes: 0, nextIndex: 0, totalLength: 0, mimeType: "video/mp4" }; }
}

async function appendPartialChunkToDB(record: PartialChunkRecord): Promise<void> {
  try {
    const db = await openVideoDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(PARTIAL_STORE_NAME, "readwrite");
      tx.objectStore(PARTIAL_STORE_NAME).put({ ...record, mimeType: normalizeVideoMimeType(record.mimeType) });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {}
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
    if (typeof navigator === "undefined" || !navigator.storage?.getDirectory) return null;
    const root = await navigator.storage.getDirectory();
    const file = await (await root.getFileHandle(`uzov_video_${id}.mp4`, { create: false })).getFile();
    return file && file.size > 1024 ? file : null;
  } catch { return null; }
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
    return true;
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
    let pos = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value && value.byteLength > 0) { await writable.write({ type: "write", position: pos, data: value }); pos += value.byteLength; }
      }
      await writable.close();
      return true;
    } catch (err) { await writable.close().catch(() => {}); throw err; }
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
    if (typeof (tempHandle as any).createWritable !== "function") return false;

    const existingFile = await tempHandle.getFile();
    let receivedBytes = existingFile.size || 0;
    let totalLength = 0;
    try { const savedMeta = localStorage.getItem(`uzov_meta_${cleanId}`); if (savedMeta) totalLength = Number(savedMeta) || 0; } catch {}

    if (receivedBytes > 0 && totalLength > 0 && receivedBytes <= totalLength) onProgress?.(Math.min(99.9999, (receivedBytes / totalLength) * 100));
    else if (receivedBytes > totalLength && totalLength > 0) receivedBytes = 0;

    const writable = await (tempHandle as any).createWritable({ keepExistingData: receivedBytes > 0 });
    let retries = 0;
    try {
      while (true) {
        if (externalSignal?.aborted) throw new DOMException("Aborted", "AbortError");
        let stallTimer: ReturnType<typeof setTimeout> | null = null;
        const reqController = new AbortController();
        const onExternalAbort = () => reqController.abort();
        externalSignal?.addEventListener("abort", onExternalAbort, { once: true });
        const resetStallTimer = () => { if (stallTimer) clearTimeout(stallTimer); stallTimer = setTimeout(() => reqController.abort(), 30000); };
        try {
          resetStallTimer();
          const headers: Record<string, string> = {};
          if (receivedBytes > 0) headers.Range = `bytes=${receivedBytes}-`;
          const res = await fetch(streamUrl, { headers, cache: "no-store", signal: reqController.signal });
          if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
          if (!totalLength) {
            totalLength = Number(res.headers.get("X-Total-Size") || res.headers.get("Content-Length") || 0);
            if (!totalLength) { const m = (res.headers.get("Content-Range") || "").match(/\/(\d+)$/); if (m) totalLength = Number(m[1]); }
            if (totalLength > 0) { try { localStorage.setItem(`uzov_meta_${cleanId}`, String(totalLength)); } catch {} }
          }
          let serverStart = receivedBytes;
          if (res.status === 206) { const m = (res.headers.get("Content-Range") || "").match(/bytes\s+(\d+)-(\d+)\/(\d+)/i); if (m) serverStart = Number(m[1]); }
          else if (res.status === 200) { serverStart = 0; receivedBytes = 0; }
          if (serverStart > receivedBytes) throw new Error(`Смещенный диапазон: ${serverStart} > ${receivedBytes}`);

          let bytesToSkip = receivedBytes - serverStart;
          const reader = res.body.getReader();
          while (true) {
            resetStallTimer();
            const { done, value } = await reader.read();
            if (done) break;
            let chunk = value;
            if (bytesToSkip > 0) { if (chunk.length <= bytesToSkip) { bytesToSkip -= chunk.length; continue; } chunk = chunk.subarray(bytesToSkip); bytesToSkip = 0; }
            if (totalLength > 0) {
              const needed = totalLength - receivedBytes;
              if (needed <= 0) { await reader.cancel().catch(() => {}); break; }
              if (chunk.length > needed) chunk = chunk.subarray(0, needed);
            }
            await writable.write({ type: "write", position: receivedBytes, data: chunk });
            receivedBytes += chunk.byteLength;
            retries = 0;
            if (totalLength > 0) {
              onProgress?.(Math.min(99.9999, (receivedBytes / totalLength) * 100));
              if (receivedBytes >= totalLength) { await reader.cancel().catch(() => {}); break; }
            } else { onProgress?.(Math.min(95, 10 + (receivedBytes / (1024 * 1024)) * 2)); }
          }
          if (totalLength > 0 && receivedBytes >= totalLength) break;
          if (totalLength === 0 && receivedBytes > 0) { totalLength = receivedBytes; break; }
          throw new Error("Фоновый поток прервался, докачиваем...");
        } catch (err: any) {
          if (externalSignal?.aborted || err?.name === "AbortError") throw new DOMException("Aborted", "AbortError");
          if (++retries > 12) throw err;
          await new Promise((r) => setTimeout(r, Math.min(8000, 1000 * retries)));
        } finally { externalSignal?.removeEventListener("abort", onExternalAbort); if (stallTimer) clearTimeout(stallTimer); }
      }
      await writable.close();
    } catch (err) { await writable.close().catch(() => {}); throw err; }

    if (typeof (tempHandle as any).move === "function") await (tempHandle as any).move(finalName);
    else {
      const completedFile = await tempHandle.getFile();
      const finalWritable = await (await root.getFileHandle(finalName, { create: true }) as any).createWritable();
      await finalWritable.write(completedFile);
      await finalWritable.close();
      await root.removeEntry(tempName).catch(() => {});
    }
    try { localStorage.removeItem(`uzov_meta_${cleanId}`); } catch {}
    await clearPartialChunksFromDB(cleanId);
    const readyFile = await getVideoFromOPFS(cleanId);
    if (readyFile) { console.info(`💾 [VIDEO CACHE] Сохранено в OPFS: ${cleanId} (${(readyFile.size / 1024 / 1024).toFixed(2)} МБ)`); onProgress?.(100); return true; }
    return false;
  } catch (err: any) { if (err?.name === "AbortError") throw err; return false; }
}

async function backgroundPersistToIndexedDB(cleanId: string, streamUrl: string, onProgress?: (percent: number) => void, externalSignal?: AbortSignal): Promise<boolean> {
  try {
    const savedPartial = await loadPartialChunksFromDB(cleanId);
    const chunks: Uint8Array[] = savedPartial.chunks;
    let receivedBytes = savedPartial.receivedBytes;
    let nextChunkIndex = savedPartial.nextIndex;
    let totalLength = savedPartial.totalLength;
    let contentType = normalizeVideoMimeType(savedPartial.mimeType);
    if (receivedBytes > 0 && totalLength > 0) onProgress?.(Math.min(99.9999, (receivedBytes / totalLength) * 100));

    const FLUSH_THRESHOLD = 2 * 1024 * 1024;
    let pendingWriteChunks: Uint8Array[] = [];
    let pendingWriteBytes = 0;

    const flushPendingToDisk = async () => {
      if (!pendingWriteBytes || !pendingWriteChunks.length) return;
      const merged = new Uint8Array(pendingWriteBytes);
      let offset = 0;
      for (const part of pendingWriteChunks) { merged.set(part, offset); offset += part.byteLength; }
      const idx = nextChunkIndex++;
      pendingWriteChunks = []; pendingWriteBytes = 0;
      await appendPartialChunkToDB({ key: `${cleanId}_${idx}`, trackId: cleanId, index: idx, data: merged, totalLength, mimeType: contentType });
    };

    let retries = 0;
    while (true) {
      if (externalSignal?.aborted) { await flushPendingToDisk(); throw new DOMException("Aborted", "AbortError"); }
      let stallTimer: ReturnType<typeof setTimeout> | null = null;
      const reqController = new AbortController();
      const onExternalAbort = () => reqController.abort();
      externalSignal?.addEventListener("abort", onExternalAbort, { once: true });
      const resetStallTimer = () => { if (stallTimer) clearTimeout(stallTimer); stallTimer = setTimeout(() => reqController.abort(), 30000); };
      try {
        resetStallTimer();
        const headers: Record<string, string> = {};
        if (receivedBytes > 0) headers.Range = `bytes=${receivedBytes}-`;
        const res = await fetch(streamUrl, { headers, cache: "no-store", signal: reqController.signal });
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
        if (!totalLength) {
          totalLength = Number(res.headers.get("X-Total-Size") || res.headers.get("Content-Length") || 0);
          if (!totalLength) { const m = (res.headers.get("Content-Range") || "").match(/\/(\d+)$/); if (m) totalLength = Number(m[1]); }
          contentType = normalizeVideoMimeType(res.headers.get("Content-Type") || "video/mp4");
        }
        let serverStart = receivedBytes;
        if (res.status === 206) { const m = (res.headers.get("Content-Range") || "").match(/bytes\s+(\d+)-(\d+)\/(\d+)/i); if (m) serverStart = Number(m[1]); }
        else if (res.status === 200) serverStart = 0;
        if (serverStart > receivedBytes) throw new Error(`Смещенный диапазон: ${serverStart} > ${receivedBytes}`);

        let bytesToSkip = receivedBytes - serverStart;
        const reader = res.body.getReader();
        while (true) {
          resetStallTimer();
          const { done, value } = await reader.read();
          if (done) break;
          let chunk = value;
          if (bytesToSkip > 0) { if (chunk.length <= bytesToSkip) { bytesToSkip -= chunk.length; continue; } chunk = chunk.subarray(bytesToSkip); bytesToSkip = 0; }
          if (totalLength > 0) {
            const needed = totalLength - receivedBytes;
            if (needed <= 0) { await reader.cancel().catch(() => {}); break; }
            if (chunk.length > needed) chunk = chunk.subarray(0, needed);
          }
          const copy = new Uint8Array(chunk);
          chunks.push(copy); pendingWriteChunks.push(copy); pendingWriteBytes += copy.byteLength; receivedBytes += copy.byteLength; retries = 0;
          if (pendingWriteBytes >= FLUSH_THRESHOLD) await flushPendingToDisk();
          if (totalLength > 0) {
            onProgress?.(Math.min(99.9999, (receivedBytes / totalLength) * 100));
            if (receivedBytes >= totalLength) { await reader.cancel().catch(() => {}); break; }
          } else { onProgress?.(Math.min(95, 10 + (receivedBytes / (1024 * 1024)) * 2)); }
        }
        await flushPendingToDisk();
        if (totalLength > 0 && receivedBytes >= totalLength) break;
        if (totalLength === 0 && receivedBytes > 0) { totalLength = receivedBytes; break; }
        throw new Error("Фоновый поток прервался, докачиваем...");
      } catch (err: any) {
        await flushPendingToDisk();
        if (externalSignal?.aborted || err?.name === "AbortError") throw new DOMException("Aborted", "AbortError");
        if (++retries > 12) return false;
        await new Promise((r) => setTimeout(r, Math.min(8000, 1000 * retries)));
      } finally { externalSignal?.removeEventListener("abort", onExternalAbort); if (stallTimer) clearTimeout(stallTimer); }
    }

    const finalBlob = new Blob(chunks as unknown as BlobPart[], { type: contentType });
    if (totalLength > 0 && finalBlob.size !== totalLength) { await clearPartialChunksFromDB(cleanId); return false; }
    await saveVideoToIndexedDB(cleanId, finalBlob, contentType);
    await clearPartialChunksFromDB(cleanId);
    console.info(`💾 [VIDEO CACHE] Сохранено в IndexedDB: ${cleanId} (${(finalBlob.size / 1024 / 1024).toFixed(2)} МБ)`);
    onProgress?.(100);
    return true;
  } catch (err: any) { if (err?.name === "AbortError") throw err; return false; }
}

export async function downloadVideoBeforePlayback(trackId: string, signal: AbortSignal, onProgress?: (percent: number) => void): Promise<{ src: string; fromCache: boolean }> {
  const cleanId = String(trackId || "").trim();
  const streamUrl = `/api/videos/stream/${cleanId}`;
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");

  const opfsFile = await getVideoFromOPFS(cleanId);
  if (opfsFile) { console.info(`✅ [VIDEO CACHE] Запуск с диска (OPFS): ${cleanId}`); onProgress?.(100); return { src: URL.createObjectURL(opfsFile), fromCache: true }; }

  const cachedBlob = await getVideoFromIndexedDB(cleanId);
  if (cachedBlob) { console.info(`✅ [VIDEO CACHE] Запуск с диска (IndexedDB): ${cleanId}`); onProgress?.(100); void saveVideoToOPFS(cleanId, cachedBlob); return { src: URL.createObjectURL(cachedBlob), fromCache: true }; }

  const existingJob = activePreplayDownloads.get(cleanId);
  if (existingJob) return existingJob;

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
    try { if (!(await backgroundPersistToOPFS(cleanId, streamUrl, onProgress))) await backgroundPersistToIndexedDB(cleanId, streamUrl, onProgress); }
    catch {} finally { activeBackgroundDownloads.delete(cleanId); }
  })();
  activeBackgroundDownloads.set(cleanId, job);
}

export async function startVideoStreamWithBackgroundCache(trackId: string, onProgress?: (percent: number) => void): Promise<{ src: string; fromCache: boolean }> {
  const cleanId = String(trackId).trim();
  const streamUrl = `/api/videos/stream/${cleanId}`;
  const opfsFile = await getVideoFromOPFS(cleanId);
  if (opfsFile) { console.info(`✅ [VIDEO CACHE] Мгновенный запуск с диска (OPFS): ${cleanId}`); onProgress?.(100); return { src: URL.createObjectURL(opfsFile), fromCache: true }; }
  const cachedBlob = await getVideoFromIndexedDB(cleanId);
  if (cachedBlob) { console.info(`✅ [VIDEO CACHE] Мгновенный запуск с диска (IndexedDB): ${cleanId}`); onProgress?.(100); void saveVideoToOPFS(cleanId, cachedBlob); return { src: URL.createObjectURL(cachedBlob), fromCache: true }; }
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
  const opfsFile = await getVideoFromOPFS(cleanId);
  if (opfsFile) return URL.createObjectURL(opfsFile);
  const cachedBlob = await getVideoFromIndexedDB(cleanId);
  if (cachedBlob) { void saveVideoToOPFS(cleanId, cachedBlob); return URL.createObjectURL(cachedBlob); }
  return null;
}

export function revokeLocalVideoUrl(url: string | null | undefined): void {
  if (url && url.startsWith("blob:")) { try { URL.revokeObjectURL(url); } catch {} }
}