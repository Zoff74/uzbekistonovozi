// src/app/api/instruments/route.ts
import { NextResponse, NextRequest } from "next/server";
import { dbConnect } from "@/lib/mongoose";
import Instrument, { IInstrument } from "@/models/Instrument";
import { Model } from "mongoose";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET: Поиск инструментов для автодополнения
export async function GET(req: NextRequest) {
  try {
    await dbConnect();
    const searchParams = req.nextUrl.searchParams;
    const query = searchParams.get("q")?.trim() || "";
    const category = searchParams.get("category")?.trim();

    let filter: any = {};
    if (query) {
      filter.name = { $regex: query, $options: "i" };
    }
    if (category && category !== "all") {
      filter.category = category;
    }

    // Явно приводим модель к Model<IInstrument>, чтобы TypeScript не путался в сигнатурах
    const InstrumentModel = Instrument as Model<IInstrument>;

    const instruments = await InstrumentModel.find(filter)
      .sort({ usageCount: -1 })
      .limit(10)
      .lean();

    return NextResponse.json(
      { success: true, instruments },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
  } catch (error) {
    console.error("Error fetching instruments:", error);
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
  }
}

// POST: Добавление или инкремент счетчика инструмента при регистрации
export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    const { name, category } = await req.json();

    if (!name || !name.trim()) {
      return NextResponse.json({ success: false, error: "Instrument name is required" }, { status: 400 });
    }

    const trimmedName = name.trim();
    const slug = trimmedName
      .toLowerCase()
      .replace(/[^a-z0-9а-яўғқҳҷӯӣқçğşîâû -]/g, '')
      .split(/\s+/)
      .sort()
      .join('-');

    const InstrumentModel = Instrument as Model<IInstrument>;

    const instrument = await InstrumentModel.findOneAndUpdate(
      { slug },
      { 
        $setOnInsert: { name: trimmedName, category: category || "general" },
        $inc: { usageCount: 1 } 
      },
      { upsert: true, new: true }
    );

    return NextResponse.json({ success: true, instrument });
  } catch (error) {
    console.error("Error saving instrument:", error);
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
  }
}