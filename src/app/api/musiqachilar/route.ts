
import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongoose";
import User from "@/models/User";

export const dynamic = 'force-dynamic';
export const revalidate = 0;
//src\app\api\musiqachilar\route.ts
export async function GET() {
  try {
    await dbConnect();
    
    // Ищем всех пользователей, у которых профессия НЕ является слушателем
    const users = await User.find({
      occupation: { $nin: ["tinglovchi", "", null] }
    }).lean();

    const musicians = users.map((user: any) => ({
      _id: user._id,
      name: user.username,
      avatar: user.image,
      role: user.occupation, 
    }));

    return NextResponse.json({ success: true, musicians });
  } catch (error) {
    console.error("Error fetching musicians:", error);
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
  }
}