// src/utils/videoDeviceCache.ts

const CACHE_NAME = "uzbekistonovozi-video-cache-v5";

async function getVideoFileFromDeviceOPFS(trackId: string): Promise<File | null> {
  try {
    if (typeof navigator === "undefined" || !navigator.storage?.getDirectory) {
      return null;
    }
    const root = await navigator.storage.getDirectory();
    const fileHandle = await root.getFileHandle(`uzov_video_${trackId}.mp4`, { create: false });
    const file = await fileHandle.getFile();
    return file && file.size > 1024 ? file : null;
  } catch {
    return null;
  }
}

export async function loadVideoToDevice(
  trackId: string,
  signal: AbortSignal,
  onProgress: (percent: number) => void
): Promise<string> {
  const cleanId = String(trackId).trim();
  const streamUrl = `/api/videos/stream/${cleanId}`;

  // 1. Проверяем диск устройства (OPFS) — мгновенный старт без сети
  const existingDeviceFile = await getVideoFileFromDeviceOPFS(cleanId);
  if (existingDeviceFile) {
    onProgress(100);
    return URL.createObjectURL(existingDeviceFile);
  }

  // 1b. Проверяем Cache API — мгновенный старт без сети
  try {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(streamUrl);
    if (cachedResponse) {
      const blob = await cachedResponse.blob();
      if (blob.size > 1024) {
        onProgress(100);
        return URL.createObjectURL(blob);
      }
      await cache.delete(streamUrl);
    }
  } catch {}

  // 2. Узнаем точный размер и MIME-тип файла (bytes=0-0)
  const probeRes = await fetch(streamUrl, {
    headers: { Range: "bytes=0-0" },
    signal,
  });
  if (!probeRes.ok) throw new Error(`HTTP ${probeRes.status}`);

  let totalLength = Number(probeRes.headers.get("X-Total-Size") || 0);
  if (!totalLength) {
    const match = (probeRes.headers.get("Content-Range") || "").match(/\/(\d+)$/);
    if (match) totalLength = Number(match[1]);
  }
  const contentType = probeRes.headers.get("Content-Type") || "video/mp4";
  await probeRes.body?.cancel().catch(() => {});

  if (!totalLength || totalLength <= 0) {
    throw new Error("Не удалось определить размер видеофайла");
  }

  // 3. Делим на 4 потока (кратных 4096 байт)
  const THREADS = totalLength > 5 * 1024 * 1024 ? 4 : 1;
  const alignedSegmentSize = Math.ceil(Math.ceil(totalLength / THREADS) / 4096) * 4096;

  const segments: { start: number; end: number }[] = [];
  for (let i = 0; i < THREADS; i++) {
    const start = i * alignedSegmentSize;
    if (start >= totalLength) break;
    segments.push({ start, end: Math.min(totalLength - 1, (i + 1) * alignedSegmentSize - 1) });
  }

  const threadProgress = new Array<number>(segments.length).fill(0);
  const updateTotalProgress = () => {
    if (signal.aborted) return;
    const received = threadProgress.reduce((acc, v) => acc + v, 0);
    onProgress(Math.min(99.9999, (received / totalLength) * 100));
  };

  let opfsRoot: FileSystemDirectoryHandle | null = null;
  let opfsTempHandle: FileSystemFileHandle | null = null;
  let opfsWritable: FileSystemWritableFileStream | null = null;
  let writeQueue: Promise<void> = Promise.resolve();
  let opfsWriteFailed = false;

  const tempFileName = `uzov_tmp_${cleanId}.mp4`;
  const finalFileName = `uzov_video_${cleanId}.mp4`;

  try {
    if (typeof navigator !== "undefined" && navigator.storage?.getDirectory) {
      opfsRoot = await navigator.storage.getDirectory();
      opfsTempHandle = await opfsRoot.getFileHandle(tempFileName, { create: true });
      if (typeof (opfsTempHandle as any).createWritable === "function") {
        opfsWritable = await (opfsTempHandle as any).createWritable();
        await opfsWritable!.truncate(totalLength);
      }
    }
  } catch {
    opfsWritable = null;
  }

  const downloadSegment = async (segIndex: number, segStart: number, segEnd: number): Promise<Uint8Array[]> => {
    const expectedBytes = segEnd - segStart + 1;
    let receivedInSeg = 0;
    const segChunks: Uint8Array[] = [];
    let retries = 0;

    while (receivedInSeg < expectedBytes) {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");

      try {
        const currentStart = segStart + receivedInSeg;
        const res = await fetch(streamUrl, {
          headers: { Range: `bytes=${currentStart}-${segEnd}` },
          signal,
        });
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

        let serverStart = currentStart;
        if (res.status === 206) {
          const m = (res.headers.get("Content-Range") || "").match(/bytes\s+(\d+)-(\d+)\/(\d+)/i);
          if (m) serverStart = Number(m[1]);
        }
        if (serverStart > currentStart) {
          throw new Error(`Смещенный диапазон: ${serverStart} > ${currentStart}`);
        }

        let bytesToSkip = currentStart - serverStart;
        const reader = res.body.getReader();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (signal.aborted) {
            reader.cancel();
            throw new DOMException("Aborted", "AbortError");
          }

          let chunk = value;
          if (bytesToSkip > 0) {
            if (chunk.length <= bytesToSkip) {
              bytesToSkip -= chunk.length;
              continue;
            }
            chunk = chunk.subarray(bytesToSkip);
            bytesToSkip = 0;
          }

          const needed = expectedBytes - receivedInSeg;
          if (chunk.length > needed) chunk = chunk.subarray(0, needed);

          const copy = new Uint8Array(chunk);
          const writePosition = segStart + receivedInSeg;

          if (opfsWritable && !opfsWriteFailed) {
            writeQueue = writeQueue
              .then(() => opfsWritable!.write({ type: "write", position: writePosition, data: copy }))
              .catch(() => {
                opfsWriteFailed = true;
              });
          }
          // Держим чанки в памяти для гарантированного фолбэка в Cache API, если OPFS сорвётся
          segChunks.push(copy);

          receivedInSeg += copy.length;
          threadProgress[segIndex] = Math.min(expectedBytes, receivedInSeg);
          updateTotalProgress();

          if (receivedInSeg >= expectedBytes) {
            await reader.cancel().catch(() => {});
            break;
          }
        }

        if (receivedInSeg < expectedBytes) throw new Error("Неполный сегмент");
      } catch (err: any) {
        if (signal.aborted || err?.name === "AbortError") throw err;
        if (++retries > 8) throw err;
        await new Promise((r) => setTimeout(r, 800));
      }
    }

    return segChunks;
  };

  try {
    const allSegmentChunks = await Promise.all(
      segments.map((seg, idx) => downloadSegment(idx, seg.start, seg.end))
    );

    if (signal.aborted) {
      if (opfsWritable) await opfsWritable.abort().catch(() => {});
      throw new DOMException("Aborted", "AbortError");
    }

    // 4. Пробуем финализировать OPFS атомарным переименованием (move) без дублирования места на диске
    if (opfsWritable && opfsRoot && opfsTempHandle && !opfsWriteFailed) {
      try {
        await writeQueue;
        await opfsWritable.close();
        opfsWritable = null;

        const writtenFile = await opfsTempHandle.getFile();
        if (writtenFile.size === totalLength) {
          if (typeof (opfsTempHandle as any).move === "function") {
            await (opfsTempHandle as any).move(finalFileName);
          } else {
            const finalHandle = await opfsRoot.getFileHandle(finalFileName, { create: true });
            const finalWritable = await (finalHandle as any).createWritable();
            await finalWritable.write(writtenFile);
            await finalWritable.close();
            await opfsRoot.removeEntry(tempFileName).catch(() => {});
          }

          const readyHandle = await opfsRoot.getFileHandle(finalFileName, { create: false });
          const readyFile = await readyHandle.getFile();
          onProgress(100);
          return URL.createObjectURL(new File([readyFile], finalFileName, { type: contentType }));
        }
      } catch {
        await opfsRoot.removeEntry(tempFileName).catch(() => {});
      }
    } else if (opfsWritable) {
      await opfsWritable.abort().catch(() => {});
      if (opfsRoot) await opfsRoot.removeEntry(tempFileName).catch(() => {});
    }

    // 5. Надёжный фолбэк: собираем Blob из скачанных чанков и сохраняем в Cache API
    const flatParts: BlobPart[] = [];
    for (const seg of allSegmentChunks) {
      for (const c of seg) {
        flatParts.push(c as unknown as BlobPart);
      }
    }

    const finalBlob = new Blob(flatParts, { type: contentType });
    if (finalBlob.size !== totalLength) {
      throw new Error(`Несовпадение размера: ${finalBlob.size} != ${totalLength}`);
    }

    try {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(
        streamUrl,
        new Response(finalBlob, {
          headers: { "Content-Type": contentType, "Content-Length": String(finalBlob.size) },
        })
      );
    } catch {}

    onProgress(100);
    return URL.createObjectURL(finalBlob);
  } catch (err) {
    if (opfsWritable) await opfsWritable.abort().catch(() => {});
    if (opfsRoot) await opfsRoot.removeEntry(tempFileName).catch(() => {});
    throw err;
  }
}