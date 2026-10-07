//src\app\api\categories\route.ts
import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongoose";
import mongoose from "mongoose";

export const dynamic = 'force-dynamic'; // <--- ЗАПРЕЩАЕМ NEXT.JS КЭШИРОВАТЬ ЭТОТ РОУТ

// src/app/api/categories/route.ts
export async function GET() {
    try {
        await dbConnect();
        
        // Прямой доступ к базе данных и коллекции минуя любые модели Mongoose
        const db = mongoose.connection.db;
        if (!db) {
            throw new Error("Маълумотлар базаси уланмаган");
        }

        const categories = await db.collection("categories").find({}).toArray();

        const formattedCategories = categories.map((cat: any) => ({
            _id: cat._id.toString(),
            name: cat.name,
            icon: cat.icon || "Music",
        }));

        return NextResponse.json(formattedCategories);
    } catch (error) {
        console.error("Категориялар рўйхатини олишда хатолик:", error);
        return NextResponse.json({ error: "Сервер хатолиги" }, { status: 500 });
    }
}