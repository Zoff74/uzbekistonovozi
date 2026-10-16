// src/app/api/musiqachilar/route.ts
import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongoose";
import User from "@/models/User";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    await dbConnect();
    
    // Ищем музыкантов: у которых непустой массив instruments, либо заполнено старое поле instrument, либо профессия musiqachi
    const users = await User.find({
      $or: [
        { "instruments.0": { $exists: true } },
        { instrument: { $exists: true, $ne: "" } },
        { occupation: "musiqachi" }
      ]
    }).lean();

    const musicians = users.map((user: any) => {
      // Собираем все инструменты в единый массив
      const userInstruments = user.instruments && user.instruments.length > 0 
        ? user.instruments 
        : (user.instrument ? [user.instrument] : ["Мусиқачи"]);

      return {
        _id: user._id,
        name: user.username,
        avatar: user.image,
        role: userInstruments.join(", "), // Выводим все инструменты через запятую
        instruments: userInstruments,
        instrumentIds: user.instrumentIds || (user.instrumentId ? [user.instrumentId] : []),
      };
    });

    return NextResponse.json(
      { success: true, musicians },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      }
    );
  } catch (error) {
    console.error("Error fetching musicians:", error);
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
  }
}