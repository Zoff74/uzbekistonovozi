// src/app/api/user/profile/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth.config";
import { dbConnect } from "@/lib/mongoose";
import User from "@/models/User";
import ImageKit from "imagekit";

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

// GET: Получение данных (либо по ID из query для публичного профиля, либо текущего юзера)
export async function GET(req: Request) {
    try {
        await dbConnect();
        
        const { searchParams } = new URL(req.url);
        const userId = searchParams.get("id");

        // Если передан ID в строке запроса -> отдаем публичный профиль музыканта/творца
        if (userId) {
            const user = await User.findById(userId)
                .select("username image occupation bio phone telegram email location")
                .lean();

            if (!user) {
                return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
            }

            // Маппим под формат, который ожидает фронтенд профиля
            const formattedUser = {
                _id: user._id,
                name: user.username,
                image: user.image,
                occupation: user.occupation,
                bio: (user as any).bio,
                phone: (user as any).phone,
                telegram: (user as any).telegram,
                email: (user as any).email,
                location: (user as any).location,
            };

            return NextResponse.json({ success: true, user: formattedUser });
        }

        // Иначе работаем как раньше для личного кабинета (требуется сессия)
        const session = (await getServerSession(authOptions)) as SessionData | null;
        if (!session || !session.user?.id) {
            return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
        }

        const user = await User.findById(session.user.id).select("username email image imageFileId").lean();

        if (!user) {
            return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
        }

        return NextResponse.json({ success: true, user });
    } catch (error: any) {
        return NextResponse.json({ success: false, message: error.message || "Server error" }, { status: 500 });
    }
}

// PUT: Обновление профиля остается без изменений
export async function PUT(req: Request) {
    try {
        const session = (await getServerSession(authOptions)) as SessionData | null;
        if (!session || !session.user?.id) {
            return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { name, avatarUrl, avatarFileId } = body;

        await dbConnect();

        const currentUser = await User.findById(session.user.id);
        if (!currentUser) {
            return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
        }

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

        const updateData: any = {};
        if (name !== undefined) updateData.username = name;
        if (avatarUrl !== undefined) updateData.image = avatarUrl;
        if (avatarFileId !== undefined) updateData.imageFileId = avatarFileId;

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