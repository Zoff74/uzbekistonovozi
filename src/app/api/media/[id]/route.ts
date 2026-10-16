// src/app/api/media/[id]/route.ts
import { NextResponse, NextRequest } from "next/server";
import { getGridFSBuckets } from "@/lib/gridfs";
import { ObjectId } from "mongodb";

export async function GET(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const fileId = params.id;
        if (!ObjectId.isValid(fileId)) {
            return NextResponse.json({ error: "Неверный ID файла" }, { status: 400 });
        }

        const { bucket, db } = await getGridFSBuckets();
        const filesCollection = db.collection("uploads.files");
        
        // Добавляем allowDiskUse: true, чтобы MongoDB не падала по лимиту памяти при поиске чанков
        const fileDoc = await filesCollection.findOne(
            { _id: new ObjectId(fileId) },
            { allowDiskUse: true } as any
        );

        if (!fileDoc) {
            return NextResponse.json({ error: "Файл не найден" }, { status: 404 });
        }

        const fileSize = fileDoc.length;
        const range = req.headers.get("range");

        let start = 0;
        let end = fileSize - 1;

        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            start = parseInt(parts[0], 10);
            if (parts[1]) {
                end = parseInt(parts[1], 10);
            }
        }

        if (start >= fileSize) {
            return new NextResponse("Requested range not satisfiable", {
                status: 416,
                headers: { "Content-Range": `bytes */${fileSize}` },
            });
        }

        const chunksize = (end - start) + 1;

        // Открываем нативный поток чтения из GridFS с учетом диапазона
        const downloadStream = bucket.openDownloadStream(new ObjectId(fileId), {
            start,
            end: end + 1,
        });

        // Конвертируем Node.js Stream в Web ReadableStream для Next.js App Router
        const webStream = new ReadableStream({
            start(controller) {
                downloadStream.on("data", (chunk) => {
                    controller.enqueue(chunk);
                });
                downloadStream.on("end", () => {
                    try {
                        controller.close();
                    } catch {}
                });
                downloadStream.on("error", (err) => {
                    try {
                        controller.error(err);
                    } catch {}
                });
            },
            cancel() {
                try {
                    downloadStream.destroy();
                } catch {}
            },
        });

        const headers: Record<string, string> = {
            "Content-Type": fileDoc.contentType || "application/octet-stream",
            "Accept-Ranges": "bytes",
        };

        if (range) {
            headers["Content-Range"] = `bytes ${start}-${end}/${fileSize}`;
            headers["Content-Length"] = chunksize.toString();
            return new NextResponse(webStream, { status: 206, headers });
        } else {
            headers["Content-Length"] = fileSize.toString();
            return new NextResponse(webStream, { status: 200, headers });
        }
    } catch (error) {
        console.error("Ошибка при стриминге из GridFS:", error);
        return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
    }
}