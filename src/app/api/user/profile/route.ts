export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

import { NextResponse, NextRequest } from "next/server";
import ImageKit from "@imagekit/nodejs";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth.config";
import { dbConnect } from "@/lib/mongoose";
import User from "@/models/User";

const imagekit = new ImageKit({
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY || "dummy_private_key",
});

export async function GET() {
  try {
    const expire = Math.floor(Date.now() / 1000) + 30 * 60;
    const authenticationParameters = imagekit.helper.getAuthenticationParameters(undefined, expire);

    return NextResponse.json({
      publicKey: process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY,
      ...authenticationParameters,
      expire,
    });
  } catch (error: any) {
    console.error("ImageKit auth error:", error);
    return NextResponse.json({ error: error.message || "Auth error" }, { status: 500 });
  }
}

async function handleProfileUpdate(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user || !(session.user as any).id) {
      return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
    }

    const userId = (session.user as any).id;
    await dbConnect();

    let body: any = {};
    const contentType = request.headers.get("content-type") || "";
    
    if (contentType.includes("application/json")) {
      body = await request.json();
    } else {
      const formData = await request.formData();
      body = {
        username: formData.get("username") || formData.get("name"),
        phoneNumber: formData.get("phoneNumber") || formData.get("phone"),
        occupation: formData.get("occupation"),
        instrument: formData.get("instrument"),
        bio: formData.get("bio"),
        telegram: formData.get("telegram"),
        image: formData.get("image") || formData.get("avatarUrl"),
        imageFileId: formData.get("imageFileId") || formData.get("avatarFileId"),
      };
    }

    const updateFields: any = {};
    if (body.username !== undefined && body.username !== null && body.username !== "") updateFields.username = body.username;
    if (body.name !== undefined && body.name !== null && body.name !== "") updateFields.username = body.name;
    if (body.phoneNumber !== undefined && body.phoneNumber !== null) updateFields.phoneNumber = body.phoneNumber;
    if (body.phone !== undefined && body.phone !== null) updateFields.phone = body.phone;
    if (body.occupation !== undefined && body.occupation !== null) updateFields.occupation = body.occupation;
    if (body.instrument !== undefined && body.instrument !== null) updateFields.instrument = body.instrument;
    if (body.bio !== undefined && body.bio !== null) updateFields.bio = body.bio;
    if (body.telegram !== undefined && body.telegram !== null) updateFields.telegram = body.telegram;
    if (body.image !== undefined && body.image !== null) updateFields.image = body.image;
    if (body.avatarUrl !== undefined && body.avatarUrl !== null) updateFields.image = body.avatarUrl;
    if (body.imageFileId !== undefined && body.imageFileId !== null) updateFields.imageFileId = body.imageFileId;
    if (body.avatarFileId !== undefined && body.avatarFileId !== null) updateFields.imageFileId = body.avatarFileId;

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updateFields },
      { new: true }
    ).select("-password");

    if (!updatedUser) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: "Профиль успешно обновлен",
      user: updatedUser,
    });

  } catch (error: any) {
    console.error("Profile update error:", error);
    return NextResponse.json({ error: error.message || "Ошибка при обновлении профиля" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  return handleProfileUpdate(request);
}

export async function PATCH(request: NextRequest) {
  return handleProfileUpdate(request);
}