//src\app\api\musiqachilar\route.ts
import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongoose";
import User from "@/models/User";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    await dbConnect();
    
    // Ищем пользователей с ролью 'savdogar' (продавцы/творцы), 
    // у которых в occupation указана музыкальная деятельность (латиница и кириллица)
    const users = await User.find({
      role: "savdogar",
      occupation: { $regex: /musiqachi|мусиқачи|sozanda|созанда|музыкант|хонанда|xonanda/i }
    }).lean();

    const musicians = users.map((user: any) => ({
      _id: user._id,
      name: user.username,
      avatar: user.image,
      role: user.occupation || "Созанда",
    }));

    // Возвращаем объект со статусом и массивом (или просто массив, в зависимости от фронтенда)
    return NextResponse.json({ success: true, musicians });
  } catch (error) {
    console.error("Error fetching musicians:", error);
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
  }
}