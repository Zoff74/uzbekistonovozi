export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextResponse, NextRequest } from "next/server";

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const rawParam = searchParams.get("url") || searchParams.get("fileId");

    if (!rawParam) {
        return NextResponse.json({ error: "File ID or URL is required" }, { status: 400 });
    }

    try {
        let messageId = "";
        let channelUsername = process.env.TELEGRAM_VIDEO_CHANNEL_ID || "uzbekistonovozi_video";

        if (rawParam.includes("t.me/")) {
            const match = rawParam.match(/\/([^\/]+)\/(\d+)$/);
            if (match) {
                channelUsername = match[1];
                messageId = match[2];
            }
        } else {
            messageId = rawParam.trim();
        }

        const cleanChannelName = channelUsername.replace("@", "");
        const directPostUrl = `https://t.me/${cleanChannelName}/${messageId}`;

        return NextResponse.json({ 
            success: true, 
            videoUrl: `/api/videos/stream/${messageId}`, 
            fileId: messageId,
            messageId: messageId,
            directUrl: directPostUrl
        });

    } catch (error: any) {
        console.error("🔥 [EXTRACT CRITICAL ERROR]:", error);
        return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
    }
}