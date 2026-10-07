//src\app\api\qoshiq-ijrochilari\[id]\route.ts
import { NextResponse } from "next/server";
import { Types, Model } from "mongoose";
import { dbConnect } from "@/lib/mongoose";
import User from "@/models/User";
import { Track, ITrack } from "@/models/Track";
import { Video, IVideo } from "@/models/Video";

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    await dbConnect();
    
    const { id } = await params;

    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
    }

    const singerRecord: any = await User.findById(id).lean();
    if (!singerRecord) {
      return NextResponse.json({ error: "Singer not found" }, { status: 404 });
    }

    const objectId = new Types.ObjectId(id);

    const tracks = await (Track as Model<ITrack>).find({ authorId: objectId }).lean();
    const clips = await (Video as Model<IVideo>).find({ authorId: objectId }).lean();

    const totalPlaysCount = tracks.reduce((acc, t: any) => acc + (Number(t.plays) || 0), 0);

    return NextResponse.json({
      singer: {
        _id: singerRecord._id,
        name: singerRecord.username,
        role: singerRecord.occupation || singerRecord.role || "Хонанда / Ижрочи",
        avatar: singerRecord.image,
        bio: singerRecord.bio,
        phone: singerRecord.phoneNumber,
        email: singerRecord.email,
        isVerified: singerRecord.isTelegramVerified || false,
        stats: {
          totalTracks: tracks.length,
          totalPlays: totalPlaysCount > 1000 ? `${(totalPlaysCount / 1000).toFixed(1)}K` : String(totalPlaysCount),
        }
      },
      tracks,
      clips,
    });
  } catch (error) {
    console.error("API Error fetching singer profile:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}