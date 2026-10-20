import { NextResponse } from "next/server";
import ImageKit from "@imagekit/nodejs";

// Инициализируем новый SDK только с privateKey
const imagekit = new ImageKit({
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY || "dummy_private_key",
});

export async function GET() {
  try {
    const expire = Math.floor(Date.now() / 1000) + 30 * 60;
    
    // В новом SDK генерация параметров перенесена в helper
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