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
                .select("username image occupation instrument bio phoneNumber telegram email location")
                .lean();

            if (!user) {
                return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
            }

            const formattedUser = {
                _id: user._id,
                name: user.username,
                image: user.image,
                occupation: user.occupation,
                instrument: (user as any).instrument,
                bio: (user as any).bio,
                phone: (user as any).phoneNumber,
                telegram: (user as any).telegram,
                email: (user as any).email,
                location: (user as any).location,
            };

            return NextResponse.json({ success: true, user: formattedUser });
        }

        // Для личного кабинета (требуется сессия)
        const session = (await getServerSession(authOptions)) as SessionData | null;
        if (!session || !session.user?.id) {
            return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
        }

        // Добавили occupation в select
        const user = await User.findById(session.user.id)
            .select("username email image imageFileId occupation instrument bio phoneNumber telegram")
            .lean();

        if (!user) {
            return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
        }

        // Маппим phoneNumber в phone для фронтенда, если требуется
        const formattedUser = {
            ...user,
            phone: (user as any).phoneNumber || "",
        };

        return NextResponse.json({ success: true, user: formattedUser });
    } catch (error: any) {
        return NextResponse.json({ success: false, message: error.message || "Server error" }, { status: 500 });
    }
}

// PUT: Обновление профиля
export async function PUT(req: Request) {
    try {
        const session = (await getServerSession(authOptions)) as SessionData | null;
        if (!session || !session.user?.id) {
            return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { name, avatarUrl, avatarFileId, occupation, instrument, bio, phone, telegram } = body;

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
        if (occupation !== undefined) updateData.occupation = occupation; // Добавили обновление профессии
        
        if (instrument !== undefined) {
            updateData.instrument = instrument;
            updateData.instrumentId = instrument
                .trim()
                .toLowerCase()
                .replace(/\s+/g, '-')
                .replace(/[^a-z0-9а-яўғқҳҷӯӣқçğşîâû -]/g, '');
        }
        if (bio !== undefined) updateData.bio = bio;
        if (phone !== undefined) updateData.phoneNumber = phone; // В модели поле называется phoneNumber
        if (telegram !== undefined) updateData.telegram = telegram;

        const updatedUser = await User.findByIdAndUpdate(
            session.user.id,
            updateData,
            { new: true }
        ).select("username email image imageFileId occupation instrument bio phoneNumber telegram");

        const formattedUser = {
            ...updatedUser.toObject(),
            phone: updatedUser.phoneNumber || "",
        };

        return NextResponse.json({ success: true, user: formattedUser });
    } catch (error: any) {
        return NextResponse.json({ success: false, message: error.message || "Server error" }, { status: 500 });
    }
}