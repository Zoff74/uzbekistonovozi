import { NextResponse } from "next/server";
//src\app\api\videos\extract\route.ts
export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const url = searchParams.get("url");

    if (!url) {
        return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    try {
        // Превращаем t.me/channel/123 в публичную веб-версию t.me/s/channel/123
        let webUrl = url.trim();
        if (webUrl.includes("t.me/") && !webUrl.includes("t.me/s/")) {
            webUrl = webUrl.replace("t.me/", "t.me/s/");
        }

        const response = await fetch(webUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            },
        });

        if (!response.ok) {
            return NextResponse.json({ error: "Failed to fetch Telegram post" }, { status: 400 });
        }

        const html = await response.text();

        // Ищем тег <video> или прямую ссылку на mp4 в коде страницы телеграма
        const matchVideoTag = html.match(/<video[^>]+src="([^">]+)"/i);
        const matchSourceTag = html.match(/<source[^>]+src="([^">]+)"/i);
        const matchOgVideo = html.match(/<meta[^>]+property="og:video"[^>]+content="([^">]+)"/i) || html.match(/<meta[^>]+content="([^">]+)"[^>]+property="og:video"/i);

        const videoSrc = matchVideoTag?.[1] || matchSourceTag?.[1] || matchOgVideo?.[1];

        if (!videoSrc) {
            return NextResponse.json({ error: "Video source not found in post" }, { status: 404 });
        }

        // Телеграм иногда отдает ссылки с &amp; вместо &
        const cleanVideoUrl = videoSrc.replace(/&amp;/g, "&");

        return NextResponse.json({ videoUrl: cleanVideoUrl });
    } catch (error) {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}