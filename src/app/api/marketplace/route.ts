// src/app/api/marketplace/route.ts
import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongoose";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth.config";
import MarketplaceItem from "@/models/MarketplaceItem"; // Модель объявления
import User from "@/models/User";

export const dynamic = 'force-dynamic';

// GET: Получить список всех товаров маркетплейса
export async function GET() {
  try {
    await dbConnect();
    const products = await MarketplaceItem.find({}).sort({ createdAt: -1 }).lean();
    return NextResponse.json({ success: true, products });
  } catch (error) {
    console.error("Error fetching marketplace items:", error);
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
  }
}

// POST: Выставить товар на продажу (ДОСТУПНО ВСЕМ АВТОРИЗОВАННЫМ ПОЛЬЗОВАТЕЛЯМ)
export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    const session = await getServerSession(authOptions);

    // Единственное требование — быть в системе
    if (!session || !session.user || !session.user.id) {
      return NextResponse.json(
        { success: false, error: "Эълон бериш учун тизимга киришингиз керак." },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { title, price, currency, image, category, description, phone, telegram } = body;

    if (!title || !price || !image) {
      return NextResponse.json(
        { success: false, error: "Илтимос, сифатли сарлавҳа, нарх ва расмни киритинг." },
        { status: 400 }
      );
    }

    const user = await User.findById(session.user.id).lean();

    const newProduct = await MarketplaceItem.create({
      title,
      price: Number(price),
      currency: currency || "сўм",
      image,
      category: category || "Мусиқа асбоблари",
      description: description || "",
      seller: user?.username || session.user.name || "Фойдаланувчи",
      sellerId: session.user.id,
      phone: phone || user?.phoneNumber || "",
      telegram: telegram || user?.telegram || "",
      createdAt: new Date(),
    });

    return NextResponse.json({ success: true, product: newProduct });
  } catch (error) {
    console.error("Error posting marketplace item:", error);
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
  }
}