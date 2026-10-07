//src\app\api\discussions\route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth.config";
import { dbConnect } from "@/lib/mongoose";
import { Comment } from "@/models/Comment";
import "@/models/User";

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const targetId = searchParams.get("targetId");

    if (!targetId) {
      return NextResponse.json({ error: "targetId is required" }, { status: 400 });
    }

    await dbConnect();

    // Исправлено: запрашиваем username вместо name, так как в User модели поле называется username
    const comments = await Comment.find({ targetId })
      .populate("userId", "username image")
      .populate({
        path: "parentId",
        populate: { path: "userId", select: "username" },
      })
      .sort({ createdAt: -1 })
      .lean();

    const formattedComments = comments.map((c: any) => {
      const date = new Date(c.createdAt);
      const formattedDate = `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}, ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

      return {
        id: c._id.toString(),
        user: {
          name: c.userId?.username || "Foydalanuvchi", // Использован username
          image: c.userId?.image || null,
        },
        text: c.text,
        replyTo: c.parentId ? {
          userName: c.parentId.userId?.username || "Foydalanuvchi", // Использован username
          text: c.parentId.text,
        } : null,
        createdAt: formattedDate,
      };
    });

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
    const { targetId, targetType, text, parentId } = body;

    if (!targetId || !text || !text.trim()) {
      return NextResponse.json({ error: "targetId and text are required" }, { status: 400 });
    }

    await dbConnect();
    const userId = (session.user as any).id;

    const newComment = await Comment.create({
      targetId,
      targetType: targetType || "track",
      userId,
      text: text.trim(),
      parentId: parentId || null,
    });

    // Исправлено: запрашиваем username вместо name
    await newComment.populate("userId", "username image");
    if (parentId) {
      await newComment.populate({
        path: "parentId",
        populate: { path: "userId", select: "username" },
      });
    }

    const populatedUser: any = newComment.userId;
    const parentComment: any = newComment.parentId;

    const date = new Date(newComment.createdAt);
    const formattedDate = `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}, ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

    const formattedResponse = {
      id: newComment._id.toString(),
      user: {
        name: populatedUser?.username || "Foydalanuvchi", // Использован username
        image: populatedUser?.image || null,
      },
      text: newComment.text,
      replyTo: parentComment ? {
        userName: parentComment.userId?.username || "Foydalanuvchi", // Использован username
        text: parentComment.text,
      } : null,
      createdAt: formattedDate,
    };

    return NextResponse.json(formattedResponse, { status: 201 });
  } catch (error) {
    console.error("Ошибка при создании обсуждения:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}