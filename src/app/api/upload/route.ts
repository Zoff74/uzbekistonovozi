import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 600;
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
    try {
        const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
        if (!token || !token.sub) {
            return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
        }

        const userName = token.name || token.sub;
        const contentType = request.headers.get("content-type") || "";

        if (!contentType.includes("multipart/form-data")) {
            return NextResponse.json({ error: "Ожидается multipart/form-data" }, { status: 400 });
        }

        const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        const storageChatId = process.env.TELEGRAM_STORAGE_CHAT_ID;

        if (!BOT_TOKEN || !storageChatId) {
            return NextResponse.json({ error: "Не настроен Telegram Storage" }, { status: 500 });
        }

        // Получаем нативный входящий поток запроса Node.js, минуя ограничения Next.js
        // @ts-ignore
        const nodeReqStream = request.body;

        if (!nodeReqStream) {
            return NextResponse.json({ error: "Пустое тело запроса" }, { status: 400 });
        }

        console.log("🚀 Запуск прямого стриминга в Telegram...");

        // Отправляем поток в Telegram без буферизации
        const telegramRes = await fetch(
            `https://api.telegram.org/bot${BOT_TOKEN}/sendVideo?chat_id=${storageChatId}&supports_streaming=true&caption=${encodeURIComponent(`🎥 Video: ${userName}`)}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': contentType,
                },
                // @ts-ignore
                body: nodeReqStream,
                // @ts-ignore
                duplex: 'half',
            }
        );

        const responseText = await telegramRes.text();
        console.log("📥 Ответ от Telegram:", telegramRes.status);

        let telegramResult;
        try {
            telegramResult = JSON.parse(responseText);
        } catch (e) {
            console.error("❌ Ошибка парсинга ответа Telegram:", responseText);
            return NextResponse.json({ error: "Ошибка ответа от Telegram API" }, { status: 500 });
        }

        if (!telegramRes.ok || !telegramResult.ok) {
            return NextResponse.json({ error: telegramResult?.description || "Ошибка Telegram API" }, { status: 500 });
        }

        const uploadedFile = telegramResult.result.video || telegramResult.result.document;

        if (uploadedFile && uploadedFile.file_id) {
            return NextResponse.json({
                success: true,
                fileId: uploadedFile.file_id,
                messageId: telegramResult.result.message_id,
                url: `/api/videos/stream/${uploadedFile.file_id}`,
                name: uploadedFile.file_name || "video.mp4",
            });
        }

        return NextResponse.json({ error: "Не удалось получить file_id" }, { status: 500 });

    } catch (error: any) {
        console.error("🔥 Ошибка стриминга:", error?.message || error);
        return NextResponse.json({ error: error.message || "Ошибка сервера при проксировании" }, { status: 500 });
    }
}