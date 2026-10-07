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
        const fileDoc = await filesCollection.findOne({ _id: new ObjectId(fileId) });

        if (!fileDoc) {
            return NextResponse.json({ error: "Файл не найден" }, { status: 404 });
        }

        const downloadStream = bucket.openDownloadStream(new ObjectId(fileId));

        const readableStream = new ReadableStream({
            start(controller) {
                downloadStream.on("data", (chunk) => controller.enqueue(chunk));
                downloadStream.on("end", () => controller.close());
                downloadStream.on("error", (err) => controller.error(err));
            },
        });

        return new NextResponse(readableStream, {
            headers: {
                "Content-Type": fileDoc.contentType || "application/octet-stream",
                "Content-Length": fileDoc.length.toString(),
            },
        });
    } catch (error) {
        console.error("Ошибка при получении файла из GridFS:", error);
        return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
    }
}
