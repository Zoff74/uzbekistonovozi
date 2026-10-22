import { NextResponse, NextRequest } from "next/server";
import { getGridFSBuckets } from "@/lib/gridfs";
import { ObjectId } from "mongodb";

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const resolvedParams = await params;
        const fileId = resolvedParams.id;
        
        console.log("🔍 [MEDIA API] Запрос файла с ID:", fileId);

        if (!ObjectId.isValid(fileId)) {
            console.warn("❌ [MEDIA API] Неверный формат ObjectId:", fileId);
            return NextResponse.json({ error: "Неверный ID файла" }, { status: 400 });
        }

        const { bucket, db } = await getGridFSBuckets();
        const filesCollection = db.collection("uploads.files");
        
        const fileDoc = await filesCollection.findOne(
            { _id: new ObjectId(fileId) },
            { allowDiskUse: true } as any
        );

        if (!fileDoc) {
            console.warn("❌ [MEDIA API] Документ НЕ найден в collection 'uploads.files' для ID:", fileId);
            return NextResponse.json({ error: "Файл не найден" }, { status: 404 });
        }

        console.log("✅ [MEDIA API] Файл найден:", fileDoc.filename, "Размер:", fileDoc.length);

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
        const downloadStream = bucket.openDownloadStream(new ObjectId(fileId), {
            start,
            end: end + 1,
        });

        const webStream = new ReadableStream({
            start(controller) {
                downloadStream.on("data", (chunk) => controller.enqueue(chunk));
                downloadStream.on("end", () => {
                    try { controller.close(); } catch {}
                });
                downloadStream.on("error", (err) => {
                    console.error("❌ [MEDIA API] Ошибка стрима GridFS:", err);
                    try { controller.error(err); } catch {}
                });
            },
            cancel() {
                try { downloadStream.destroy(); } catch {}
            },
        });

        const headers: Record<string, string> = {
            "Content-Type": fileDoc.contentType || "image/png",
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
        console.error("🔥 [MEDIA API ERROR]:", error);
        return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
    }
}