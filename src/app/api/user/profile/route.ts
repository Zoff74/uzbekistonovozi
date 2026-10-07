// src/app/api/user/profile/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth.config";
import { dbConnect } from "@/lib/mongoose";
import User from "@/models/User";
import ImageKit from "imagekit";

// Инициализируем ImageKit для зачистки старых аватарок
const imagekit = new ImageKit({
    publicKey: process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY || "",
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY || "",
    urlEndpoint: process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT || "",
});

interface SessionData {
    user?: {
        id?: string;
        name?: string | null;
        email?: string | null;
    };
}

// GET: Получение данных текущего пользователя
export async function GET() {
    try {
        const session = (await getServerSession(authOptions)) as SessionData | null;
        if (!session || !session.user?.id) {
            return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
        }

        await dbConnect();
        const user = await User.findById(session.user.id).select("username email image imageFileId").lean();

        if (!user) {
            return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
        }

        return NextResponse.json({ success: true, user });
    } catch (error: any) {
        return NextResponse.json({ success: false, message: error.message || "Server error" }, { status: 500 });
    }
}

// PUT: Обновление профиля + УДАЛЕНИЕ СТАРОГО МУСОРА ИЗ IMAGEKIT ПО `imageFileId`
export async function PUT(req: Request) {
    try {
        const session = (await getServerSession(authOptions)) as SessionData | null;
        if (!session || !session.user?.id) {
            return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { name, avatarUrl, avatarFileId } = body;

        await dbConnect();

        // 1. Находим пользователя ДО обновления, чтобы забрать его старый imageFileId из базы
        const currentUser = await User.findById(session.user.id);
        if (!currentUser) {
            return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
        }

        // 2. Если прилетел новый файл (avatarFileId) и у юзера РАНЬШЕ был другой файл в ImageKit — удаляем его
        if (
            avatarFileId && 
            currentUser.imageFileId && 
            currentUser.imageFileId !== avatarFileId
        ) {
            try {
                await imagekit.deleteFile(currentUser.imageFileId);
            } catch (deleteError: any) {
                console.error("Не удалось удалить старый файл из ImageKit:", deleteError.message);
            }
        }

        // 3. Формируем данные для обновления
        const updateData: any = {};
        if (name !== undefined) updateData.username = name;
        if (avatarUrl !== undefined) updateData.image = avatarUrl;
        if (avatarFileId !== undefined) updateData.imageFileId = avatarFileId;

        // 4. Обновляем юзера в базе
        const updatedUser = await User.findByIdAndUpdate(
            session.user.id,
            updateData,
            { new: true }
        ).select("username email image imageFileId");

        return NextResponse.json({ success: true, user: updatedUser });
    } catch (error: any) {
        return NextResponse.json({ success: false, message: error.message || "Server error" }, { status: 500 });
    }
}