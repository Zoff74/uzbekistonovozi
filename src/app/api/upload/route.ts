// src/app/api/upload/route.ts
import { Logger } from "telegram/extensions/Logger";

try { Logger.setLevel("none"); } catch {}
process.removeAllListeners('unhandledRejection');
process.on('unhandledRejection', (reason: any) => {
    const msg = reason?.message || String(reason);
    if (msg.includes('TIMEOUT') || msg.includes('updates.js') || reason?.stack?.includes('updates.js')) return;
});

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 600;
export const runtime = 'nodejs';

import { NextResponse, NextRequest } from "next/server";
import ImageKit from "@imagekit/nodejs";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth.config";
import path from "path";
import os from "os";
import fs from "fs/promises";
import { createReadStream, createWriteStream } from "fs";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { execFile, spawn } from "child_process";
import { promisify } from "util";
import readline from "readline";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";

const execFileAsync = promisify(execFile);

const MAX_VIDEO_SIZE_MB = Number(process.env.MAX_VIDEO_SIZE_MB || 2048);
const MAX_VIDEO_BYTES = MAX_VIDEO_SIZE_MB * 1024 * 1024;
const LARGE_MP4_THRESHOLD_MB = Number(process.env.LARGE_MP4_THRESHOLD_MB || 120);
const LARGE_MP4_THRESHOLD_BYTES = LARGE_MP4_THRESHOLD_MB * 1024 * 1024;
const LARGE_MP4_MAX_BITRATE_KBPS = Number(process.env.LARGE_MP4_MAX_BITRATE_KBPS || 3200);
const LARGE_MP4_FALLBACK_MB = Number(process.env.LARGE_MP4_FALLBACK_MB || 200);
const LARGE_MP4_FALLBACK_BYTES = LARGE_MP4_FALLBACK_MB * 1024 * 1024;
const ALLOWED_VIDEO_EXTENSIONS = [".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v"];

const imagekit = new ImageKit({ privateKey: process.env.IMAGEKIT_PRIVATE_KEY || "dummy_private_key" });

export interface UploadProgressState {
    stage: "uploading" | "converting" | "sending_telegram" | "done" | "error";
    percent: number;
    detail?: string;
    result?: { success: boolean; fileId: string; messageId: number; telegramMessageId: number; url: string; name: string; };
    updatedAt: number;
}

const globalForUploadProgress = globalThis as typeof globalThis & { __uzovUploadProgressMap?: Map<string, UploadProgressState>; };

export function getUploadProgressMap(): Map<string, UploadProgressState> {
    if (!globalForUploadProgress.__uzovUploadProgressMap) globalForUploadProgress.__uzovUploadProgressMap = new Map<string, UploadProgressState>();
    return globalForUploadProgress.__uzovUploadProgressMap;
}

function setUploadProgressState(uploadId: string, state: Omit<UploadProgressState, "updatedAt">) {
    if (!uploadId) return;
    getUploadProgressMap().set(uploadId, { ...state, percent: Math.max(0, Math.min(100, Number(state.percent) || 0)), updatedAt: Date.now() });
    if (state.stage === "error") console.error(`🛑 [UPLOAD PROGRESS ERROR] uploadId=${uploadId} | detail=${state.detail || "нет описания"}`);
}

interface MediaProbeInfo { videoCodec: string; pixFmt: string; audioCodec: string; width: number; height: number; durationSec: number; }

function parseOutTimeToSeconds(line: string): number | null {
    const trimmed = line.trim();
    if (trimmed.startsWith("out_time_us=") || trimmed.startsWith("out_time_ms=")) {
        const val = Number(trimmed.split("=")[1] || 0);
        return Number.isFinite(val) && val > 0 ? val / 1_000_000 : 0;
    }
    if (trimmed.startsWith("out_time=")) {
        const match = (trimmed.split("=")[1]?.trim() || "").match(/^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/);
        if (match) return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
    }
    return null;
}

function extractFfmpegErrorDetail(err: any, stderrTail: string[] = []): string {
    const stderr = typeof err?.stderr === "string" && err.stderr.trim() ? err.stderr.trim() : stderrTail.join(" | ").trim();
    if (stderr) return stderr.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean).slice(-10).join(" | ");
    return err?.message || String(err || "неизвестная ошибка ffmpeg");
}

async function probeMediaCodecs(inputPath: string, uploadId?: string): Promise<MediaProbeInfo | null> {
    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            const { stdout } = await execFileAsync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type,codec_name,pix_fmt,width,height,duration", "-of", "json", inputPath], { timeout: 60000 });
            const parsed = JSON.parse(stdout || "{}");
            const streams: any[] = Array.isArray(parsed.streams) ? parsed.streams : [];
            const videoStream = streams.find((s) => s.codec_type === "video");
            const audioStream = streams.find((s) => s.codec_type === "audio");
            const formatDuration = Number(parsed?.format?.duration || 0);
            const streamDuration = Number(videoStream?.duration || audioStream?.duration || 0);
            const durationSec = formatDuration > 0 ? formatDuration : streamDuration;
            return {
                videoCodec: String(videoStream?.codec_name || "").toLowerCase(),
                pixFmt: String(videoStream?.pix_fmt || "").toLowerCase(),
                audioCodec: String(audioStream?.codec_name || "").toLowerCase(),
                width: Number(videoStream?.width || 0),
                height: Number(videoStream?.height || 0),
                durationSec: Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 0,
            };
        } catch (err: any) {
            console.error(`❌ [FFPROBE ATTEMPT ${attempt} FAILED] uploadId=${uploadId || "-"} | file=${inputPath} | ${err?.stderr ? `${err.message} | ${String(err.stderr).trim()}` : (err?.message || String(err))}`);
            if (attempt < 2) await new Promise((r) => setTimeout(r, 1000));
        }
    }
    return null;
}

async function runFfmpegWithProgress(args: string[], durationSec: number, uploadId: string, stage: "converting" | "sending_telegram"): Promise<void> {
    return new Promise((resolve, reject) => {
        const stderrTail: string[] = [];
        let settled = false;
        console.info(`🔧 [FFMPEG CMD] uploadId=${uploadId} | ffmpeg ${args.join(" ")}`);
        const child = spawn("ffmpeg", ["-nostdin", "-y", "-progress", "pipe:1", "-nostats", ...args], { stdio: ["ignore", "pipe", "pipe"] });
        if (child.stdout) {
            const rl = readline.createInterface({ input: child.stdout });
            rl.on("line", (line) => {
                const trimmed = line.trim();
                const currentSec = parseOutTimeToSeconds(trimmed);
                if (currentSec !== null && durationSec > 0) setUploadProgressState(uploadId, { stage, percent: Math.min(99.9999, Math.max(0.25, (currentSec / durationSec) * 100)) });
                else if (trimmed === "progress=end") setUploadProgressState(uploadId, { stage, percent: 100 });
            });
        }
        if (child.stderr) {
            const errRl = readline.createInterface({ input: child.stderr });
            errRl.on("line", (line) => { if (line.trim()) { stderrTail.push(line.trim()); if (stderrTail.length > 30) stderrTail.shift(); } });
        }
        child.on("error", (err) => {
            if (settled) return; settled = true;
            const detail = extractFfmpegErrorDetail(err, stderrTail);
            console.error(`❌ [FFMPEG SPAWN ERROR] uploadId=${uploadId} | ${detail}`);
            reject(new Error(detail));
        });
        child.on("close", (code, signal) => {
            if (settled) return; settled = true;
            if (code === 0) { setUploadProgressState(uploadId, { stage, percent: 100 }); resolve(); }
            else {
                const detail = extractFfmpegErrorDetail({ message: `ffmpeg завершился с кодом ${code}${signal ? ` (${signal})` : ""}` }, stderrTail);
                console.error(`❌ [FFMPEG EXIT ${code}${signal ? `/${signal}` : ""}] uploadId=${uploadId} | ${detail}`);
                reject(new Error(detail));
            }
        });
    });
}

async function runEtalonMp4Transcode(inputPath: string, outputPath: string, durationSec: number, width: number, height: number, videoCodec: string, uploadId: string): Promise<boolean> {
    const threadCount = String(Math.max(2, Math.min((os.cpus()?.length || 4) - 1, 4)));
    const exceeds720p = (width > 0 && width > 1280) || (height > 0 && height > 720);
    const scaleFilter = exceeds720p ? "scale='min(1280,iw)':'min(720,ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2" : "scale=trunc(iw/2)*2:trunc(ih/2)*2";
    const startMs = Date.now();
    setUploadProgressState(uploadId, { stage: "converting", percent: 0.25 });
    console.info(`🎬 [UPLOAD VIDEO] uploadId=${uploadId} | Конвертируем/сжимаем (${videoCodec || "unknown"}, ${width || "?"}x${height || "?"}, downscale720p=${exceeds720p}, ${durationSec.toFixed(1)}s) под эталон 720p/1550k/AAC-44.1k (threads=${threadCount})...`);
    try {
        await runFfmpegWithProgress(["-threads", threadCount, "-i", inputPath, "-vf", scaleFilter, "-r", "24000/1001", "-c:v", "libx264", "-profile:v", "high", "-level", "3.1", "-preset", "fast", "-b:v", "1550k", "-maxrate", "1800k", "-bufsize", "3600k", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-c:a", "aac", "-b:a", "128k", "-ac", "2", "-ar", "44100", outputPath], durationSec, uploadId, "converting");
        const [inStat, outStat] = await Promise.all([fs.stat(inputPath), fs.stat(outputPath)]);
        if (outStat.size <= 1024) {
            console.error(`❌ [FFMPEG TRANSCODE EMPTY] uploadId=${uploadId} | Итоговый файл пуст или повреждён (size=${outStat.size})`);
            await fs.unlink(outputPath).catch(() => {});
            return false;
        }
        if (inStat.size > 0 && outStat.size > inStat.size * 1.15) {
            console.warn(`⚠️ [TRANSCODE BLOATED SKIP] uploadId=${uploadId} | Итоговый файл (${(outStat.size / 1024 / 1024).toFixed(2)} МБ) больше оригинала (${(inStat.size / 1024 / 1024).toFixed(2)} МБ) — берём оригинал`);
            await fs.unlink(outputPath).catch(() => {});
            setUploadProgressState(uploadId, { stage: "converting", percent: 100 });
            return false;
        }
        setUploadProgressState(uploadId, { stage: "converting", percent: 100 });
        console.info(`✅ [UPLOAD VIDEO] uploadId=${uploadId} | Обработка завершена за ${((Date.now() - startMs) / 1000).toFixed(1)}s (${(outStat.size / 1024 / 1024).toFixed(2)} МБ)`);
        return true;
    } catch (err: any) {
        const detail = extractFfmpegErrorDetail(err);
        console.error(`❌ [FFMPEG TRANSCODE FAILED] uploadId=${uploadId} | ${detail}`);
        await fs.unlink(outputPath).catch(() => {});
        throw new Error(detail);
    }
}

async function normalizeVideoForWeb(inputPath: string, originalName: string, tempDir: string, uniqueId: number, uploadId: string): Promise<{ filePath: string; isTempConverted: boolean }> {
    const extByName = path.extname(originalName || inputPath).toLowerCase();
    const isMp4 = extByName === ".mp4" || inputPath.toLowerCase().endsWith(".mp4");
    const inStat = await fs.stat(inputPath).catch(() => null);
    const inputSize = inStat?.size || 0;
    const sizeMb = inputSize / 1024 / 1024;
    const probe = isMp4 ? await probeMediaCodecs(inputPath, uploadId) : null;
    const durationSec = probe?.durationSec || 0, width = probe?.width || 0, height = probe?.height || 0, videoCodec = probe?.videoCodec || "";
    const avgBitrateKbps = inputSize > 0 && durationSec > 0 ? (inputSize * 8) / (durationSec * 1000) : 0;
    const shouldCompressMp4 = isMp4 && ((inputSize > LARGE_MP4_THRESHOLD_BYTES && avgBitrateKbps > LARGE_MP4_MAX_BITRATE_KBPS) || (durationSec <= 0 && inputSize >= LARGE_MP4_FALLBACK_BYTES));

    if (isMp4 && !shouldCompressMp4) {
        console.info(`⚡ [UPLOAD VIDEO] uploadId=${uploadId} | MP4 (${sizeMb.toFixed(1)} МБ, ~${Math.round(avgBitrateKbps)} kbps) — отправляем КАК ЕСТЬ без конвертации`);
        return { filePath: inputPath, isTempConverted: false };
    }
    if (shouldCompressMp4) console.info(`🗜️ [UPLOAD VIDEO] uploadId=${uploadId} | Тяжёлый MP4 (${sizeMb.toFixed(1)} МБ, ~${Math.round(avgBitrateKbps)} kbps > ${LARGE_MP4_MAX_BITRATE_KBPS} kbps / fallback ${LARGE_MP4_FALLBACK_MB} МБ) — ужимаем до эталона`);

    const outputPath = path.join(tempDir, `web_${uniqueId}.mp4`);
    const nonMp4Probe = !isMp4 ? await probeMediaCodecs(inputPath, uploadId) : null;
    const finalDuration = isMp4 ? durationSec : (nonMp4Probe?.durationSec || 0);
    const finalWidth = isMp4 ? width : (nonMp4Probe?.width || 0);
    const finalHeight = isMp4 ? height : (nonMp4Probe?.height || 0);
    const finalCodec = isMp4 ? videoCodec : (nonMp4Probe?.videoCodec || "");

    try {
        const ok = await runEtalonMp4Transcode(inputPath, outputPath, finalDuration, finalWidth, finalHeight, finalCodec, uploadId);
        return ok ? { filePath: outputPath, isTempConverted: true } : { filePath: inputPath, isTempConverted: false };
    } catch (err: any) {
        await fs.unlink(outputPath).catch(() => {});
        console.error(`❌ [NORMALIZE VIDEO FAILED] uploadId=${uploadId} | codec=${finalCodec || "unknown"} | reason=${err?.message || "ошибка ffmpeg"}`);
        return { filePath: inputPath, isTempConverted: false };
    }
}

async function getMTProtoClient() {
    const apiId = Number(process.env.TELEGRAM_API_ID || 0);
    const apiHash = process.env.TELEGRAM_API_HASH || "";
    const stringSession = process.env.TELEGRAM_STRING_SESSION || "";
    if (!apiId || !apiHash || !stringSession) throw new Error("Не настроены параметры TELEGRAM_API_ID, TELEGRAM_API_HASH или TELEGRAM_STRING_SESSION");
    const client = new TelegramClient(new StringSession(stringSession), apiId, apiHash, { connectionRetries: 5, requestRetries: 5, retryDelay: 1000, useWSS: false, autoReconnect: false, noUpdates: true } as any);
    try { client.setLogLevel("none" as any); } catch {}
    await client.connect();
    return client;
}

async function runVideoBackgroundJob(uploadId: string, inputPath: string, tempDir: string, uniqueId: number, originalName: string, videoChatId: string, coverBuffer: Buffer | null) {
    let convertedVideoPath = "", thumbPath = "", mtprotoClient: TelegramClient | null = null, keepAliveTimer: ReturnType<typeof setInterval> | null = null;
    try {
        const normalized = await normalizeVideoForWeb(inputPath, originalName, tempDir, uniqueId, uploadId);
        const finalUploadPath = normalized.filePath;
        if (normalized.isTempConverted) convertedVideoPath = normalized.filePath;

        let lastReportedPct = 0.25;
        setUploadProgressState(uploadId, { stage: "sending_telegram", percent: lastReportedPct });
        keepAliveTimer = setInterval(() => {
            const cur = getUploadProgressMap().get(uploadId);
            if (!cur || cur.stage !== "sending_telegram") return;
            const nextPct = Math.min(99.5, Number((Math.max(cur.percent, lastReportedPct) + 0.35).toFixed(4)));
            lastReportedPct = nextPct;
            setUploadProgressState(uploadId, { stage: "sending_telegram", percent: nextPct });
        }, 1000);

        const sendStartMs = Date.now();
        mtprotoClient = await getMTProtoClient();
        const finalDisplayName = normalized.isTempConverted ? originalName.replace(/\.[^/.]+$/, "") + ".mp4" : originalName;
        if (coverBuffer) { thumbPath = path.join(tempDir, `thumb_${uniqueId}.jpg`); await fs.writeFile(thumbPath, coverBuffer); }
        const targetEntity = await mtprotoClient.getEntity(videoChatId);

        const uploadedMessage = await mtprotoClient.sendFile(targetEntity, {
            file: finalUploadPath, caption: `🎬 ${finalDisplayName}`, parseMode: "html", thumb: thumbPath || undefined, forceDocument: true, workers: 4,
            progressCallback: (progress: number) => {
                const rawPct = progress <= 1 ? progress * 100 : progress;
                const nextPct = Math.min(99.9999, Math.max(lastReportedPct, Number(rawPct.toFixed(4))));
                lastReportedPct = nextPct;
                setUploadProgressState(uploadId, { stage: "sending_telegram", percent: nextPct });
            },
        } as any);

        if (keepAliveTimer) { clearInterval(keepAliveTimer); keepAliveTimer = null; }
        await mtprotoClient.disconnect().catch(() => {}); mtprotoClient = null;
        console.info(`📤 [UPLOAD VIDEO] uploadId=${uploadId} | Отправка в Telegram завершена за ${((Date.now() - sendStartMs) / 1000).toFixed(1)}s`);

        await fs.unlink(inputPath).catch(() => {});
        if (convertedVideoPath) await fs.unlink(convertedVideoPath).catch(() => {});
        if (thumbPath) await fs.unlink(thumbPath).catch(() => {});

        const messageId = uploadedMessage.id;
        const postUrl = `https://t.me/uzbekistonovozi_video/${messageId}`;
        setUploadProgressState(uploadId, { stage: "done", percent: 100, result: { success: true, fileId: postUrl, messageId, telegramMessageId: messageId, url: postUrl, name: finalDisplayName } });
    } catch (error: any) {
        if (keepAliveTimer) { clearInterval(keepAliveTimer); keepAliveTimer = null; }
        if (mtprotoClient) await mtprotoClient.disconnect().catch(() => {});
        await fs.unlink(inputPath).catch(() => {});
        if (convertedVideoPath) await fs.unlink(convertedVideoPath).catch(() => {});
        if (thumbPath) await fs.unlink(thumbPath).catch(() => {});
        const detail = error?.message || String(error || "Ошибка при обработке файла");
        console.error(`🔥 [UPLOAD VIDEO BG ERROR] uploadId=${uploadId} | detail=${detail}`, error);
        setUploadProgressState(uploadId, { stage: "error", percent: 0, detail });
    }
}

export async function POST(request: NextRequest) {
    let inputPath = "";
    const uploadId = request.headers.get("x-upload-id") || `up_${Date.now()}`;
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user || !(session.user as any).id) return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });

        setUploadProgressState(uploadId, { stage: "uploading", percent: 0.15 });
        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        const coverFile = formData.get("cover") as File | null;
        let uploadType = (formData.get("type") as string) || request.headers.get("x-upload-type") || "";
        if (!file) return NextResponse.json({ error: "Файл не передан" }, { status: 400 });

        const headerName = request.headers.get("x-file-name");
        let originalName = file.name || "file";
        if (headerName) { try { originalName = decodeURIComponent(headerName); } catch { originalName = headerName; } }

        if (!uploadType) {
            if (file.type.startsWith("image/") || originalName.match(/\.(jpg|jpeg|png|webp|avif)$/i)) uploadType = "avatar";
            else if (file.type.startsWith("audio/") || originalName.match(/\.(mp3|wav|wma|flac|aac|m4a)$/i)) uploadType = "audio";
            else uploadType = "video";
        }

        if (uploadType === "image" || uploadType === "cover" || uploadType === "avatar" || uploadType === "img") {
            const oldFileId = formData.get("oldFileId") as string | null;
            const buffer = Buffer.from(await file.arrayBuffer());
            const uniqueFileName = `${Date.now()}_${originalName.replace(/\s+/g, '_')}`;
            const mainFolder = process.env.NEXT_PUBLIC_IMAGEKIT_FOLDER || "";
            const folder = (formData.get("folder") as string) || (mainFolder ? `/${mainFolder}/covers` : "/uzbekistonovozi/covers");
            const uploadResponse: any = await imagekit.files.upload({ file: buffer.toString("base64"), fileName: uniqueFileName, folder });
            if (oldFileId && !oldFileId.startsWith("BAACAg")) { try { await imagekit.files.delete(oldFileId); } catch (err) { console.error("Ошибка при удалении старого файла:", err); } }
            setUploadProgressState(uploadId, { stage: "done", percent: 100 });
            return NextResponse.json({ success: true, fileId: uploadResponse.fileId, url: uploadResponse.url, name: uploadResponse.name });
        }

        if (uploadType === "video") {
            const ext = path.extname(originalName).toLowerCase();
            if (!ALLOWED_VIDEO_EXTENSIONS.includes(ext) || !(!file.type || file.type.startsWith("video/") || file.type === "application/octet-stream")) {
                return NextResponse.json({ error: `Неподдерживаемый формат видео (${ext || file.type || "unknown"}). Разрешены: ${ALLOWED_VIDEO_EXTENSIONS.join(", ")}` }, { status: 400 });
            }
            if (typeof file.size === "number" && file.size > MAX_VIDEO_BYTES) {
                return NextResponse.json({ error: `Файл слишком большой (${(file.size / 1024 / 1024).toFixed(1)} МБ). Максимум для Telegram: ${MAX_VIDEO_SIZE_MB} МБ (2 ГБ)` }, { status: 413 });
            }
        }

        const tempDir = os.tmpdir(), uniqueId = Date.now();
        inputPath = path.join(tempDir, `input_${uniqueId}_${originalName.replace(/[^a-zA-Z0-9.-]/g, "_")}`);
        await pipeline(Readable.fromWeb(file.stream() as any), createWriteStream(inputPath));

        const actualStat = await fs.stat(inputPath);
        if (uploadType === "video" && actualStat.size > MAX_VIDEO_BYTES) {
            await fs.unlink(inputPath).catch(() => {});
            return NextResponse.json({ error: `Файл слишком большой (${(actualStat.size / 1024 / 1024).toFixed(1)} МБ). Максимум для Telegram: ${MAX_VIDEO_SIZE_MB} МБ (2 ГБ)` }, { status: 413 });
        }

        const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        const privateChatId = process.env.TELEGRAM_STORAGE_CHAT_ID;
        const videoChatId = process.env.TELEGRAM_VIDEO_CHAT_ID || process.env.TELEGRAM_VIDEO_CHANNEL_ID || "@uzbekistonovozi_video";

        if (uploadType === "audio") {
            if (!BOT_TOKEN || !privateChatId) { await fs.unlink(inputPath).catch(() => {}); return NextResponse.json({ error: "Не настроены параметры для аудио" }, { status: 500 }); }
            setUploadProgressState(uploadId, { stage: "sending_telegram", percent: 0.25 });
            const tgFormData = new globalThis.FormData();
            tgFormData.append('chat_id', privateChatId);
            const blob = await new Response(Readable.toWeb(createReadStream(inputPath)) as any).blob();
            tgFormData.append('document', blob, originalName);
            tgFormData.append('caption', `🎵 ${originalName}`);
            tgFormData.append('parse_mode', 'HTML');
            if (coverFile) tgFormData.append('thumbnail', new Blob([await coverFile.arrayBuffer()], { type: coverFile.type || 'image/jpeg' }), 'cover.jpg');
            const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, { method: 'POST', body: tgFormData });
            await fs.unlink(inputPath).catch(() => {});
            const responseText = await response.text();
            const data = responseText ? JSON.parse(responseText) : {};
            const uploadedFile = response.ok && data?.result ? (data.result.document || data.result.audio) : null;
            if (uploadedFile && uploadedFile.file_id) {
                setUploadProgressState(uploadId, { stage: "done", percent: 100 });
                return NextResponse.json({ success: true, fileId: uploadedFile.file_id, messageId: data.result.message_id, url: `/api/tracks/stream/${uploadedFile.file_id}`, name: originalName });
            }
            return NextResponse.json({ error: data.description || "Ошибка загрузки аудио" }, { status: 500 });
        }

        if (uploadType === "video") {
            const coverBuffer = coverFile ? Buffer.from(await coverFile.arrayBuffer()) : null;
            setUploadProgressState(uploadId, { stage: "converting", percent: 0.25 });
            void runVideoBackgroundJob(uploadId, inputPath, tempDir, uniqueId, originalName, videoChatId, coverBuffer);
            return NextResponse.json({ success: true, queued: true, uploadId }, { status: 202 });
        }

        await fs.unlink(inputPath).catch(() => {});
        return NextResponse.json({ error: "Неизвестный тип файла" }, { status: 400 });
    } catch (error: any) {
        const detail = error?.message || String(error || "Ошибка при обработке файла");
        setUploadProgressState(uploadId, { stage: "error", percent: 0, detail });
        if (inputPath) await fs.unlink(inputPath).catch(() => {});
        console.error(`🔥 [UPLOAD ERROR] uploadId=${uploadId} | detail=${detail}`, error);
        return NextResponse.json({ error: detail }, { status: 500 });
    }
}