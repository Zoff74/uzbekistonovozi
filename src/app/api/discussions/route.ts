//src\app\api\discussions\route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth.config";
import { dbConnect } from "@/lib/mongoose";
import { Comment } from "@/models/Comment";
import "@/models/User";

export const dynamic = "force-dynamic";

function formatCommentDate(rawDate: unknown): string {
  const date = new Date(rawDate as string | number | Date);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}.${date.getFullYear()}, ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const targetId = String(searchParams.get("targetId") || "").trim();

    if (!targetId) {
      return NextResponse.json({ error: "targetId is required" }, { status: 400 });
    }

    await dbConnect();

    const comments = await Comment.find({ targetId })
      .populate("userId", "username image")
      .populate({
        path: "parentId",
        select: "text userId",
        populate: { path: "userId", select: "username" },
      })
      .sort({ createdAt: 1 })
      .lean();

    const formattedComments = comments.map((c: any) => ({
      id: c._id.toString(),
      parentId: c.parentId ? (typeof c.parentId === "object" && c.parentId._id ? c.parentId._id.toString() : String(c.parentId)) : null,
      user: {
        name: c.userId?.username || "Foydalanuvchi",
        image: c.userId?.image || null,
      },
      text: c.text,
      replyTo: c.parentId && typeof c.parentId === "object" ? {
        userName: c.parentId.userId?.username || "Foydalanuvchi",
        text: c.parentId.text,
      } : null,
      createdAt: formatCommentDate(c.createdAt),
    }));

    return NextResponse.json(formattedComments);
  } catch (error) {
    console.error("Ошибка при получении обсуждений:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const targetId = String(body?.targetId || "").trim();
    const targetType = String(body?.targetType || "track").trim() || "track";
    const text = String(body?.text || "").trim();
    const parentId = body?.parentId ? String(body.parentId).trim() : null;

    if (!targetId || !text) {
      return NextResponse.json({ error: "targetId and text are required" }, { status: 400 });
    }

    await dbConnect();
    const userId = (session.user as any).id;

    const newComment = await Comment.create({
      targetId,
      targetType,
      userId,
      text,
      parentId,
    });

    let replyTo: { userName: string; text: string } | null = null;
    if (parentId) {
      const parentDoc: any = await Comment.findById(parentId)
        .select("text userId")
        .populate("userId", "username")
        .lean();
      if (parentDoc) {
        replyTo = {
          userName: parentDoc.userId?.username || "Foydalanuvchi",
          text: parentDoc.text,
        };
      }
    }

    const sessionUser: any = session.user;
    const formattedResponse = {
      id: newComment._id.toString(),
      parentId: parentId || null,
      user: {
        name: sessionUser?.username || sessionUser?.name || "Foydalanuvchi",
        image: sessionUser?.image || null,
      },
      text: newComment.text,
      replyTo,
      createdAt: formatCommentDate(newComment.createdAt),
    };

    return NextResponse.json(formattedResponse, { status: 201 });
  } catch (error) {
    console.error("Ошибка при создании обсуждения:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}