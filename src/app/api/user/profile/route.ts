export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

//src\app\api\user\profile\route.ts
import { NextResponse, NextRequest } from "next/server";
import ImageKit from "@imagekit/nodejs";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth.config";
import { dbConnect } from "@/lib/mongoose";
import User from "@/models/User";

const imagekit = new ImageKit({
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY || "dummy_private_key",
});

// GET: Получение параметров авторизации ImageKit (ваш текущий функционал)
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

// PUT / PATCH: Обновление личных данных пользователя (устраняет ошибку 405)
async function handleProfileUpdate(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user || !(session.user as any).id) {
      return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
    }

    const userId = (session.user as any).id;
    await dbConnect();

    // Данные могут приходить как JSON, так и FormData
    let body: any = {};
    const contentType = request.headers.get("content-type") || "";
    
    if (contentType.includes("application/json")) {
      body = await request.json();
    } else {
      const formData = await request.formData();
      body = {
        username: formData.get("username"),
        phoneNumber: formData.get("phoneNumber"),
        occupation: formData.get("occupation"),
        image: formData.get("image"),
        imageFileId: formData.get("imageFileId"),
      };
    }

    const updateFields: any = {};
    if (body.username !== undefined) updateFields.username = body.username;
    if (body.phoneNumber !== undefined) updateFields.phoneNumber = body.phoneNumber;
    if (body.occupation !== undefined) updateFields.occupation = body.occupation;
    if (body.image !== undefined) updateFields.image = body.image;
    if (body.imageFileId !== undefined) updateFields.imageFileId = body.imageFileId;

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