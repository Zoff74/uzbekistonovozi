//src\app\api\upload\progress\[uploadId]\route.ts
import { NextRequest, NextResponse } from "next/server";
import { getUploadProgressMap } from "@/app/api/upload/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
    _request: NextRequest,
    context: { params: Promise<{ uploadId: string }> }
) {
    const { uploadId } = await context.params;
    const map = getUploadProgressMap();
    const state = map.get(uploadId);

    if (!state) {
        return NextResponse.json({
            stage: "converting",
            percent: 0,
        });
    }

    return NextResponse.json(state);
}