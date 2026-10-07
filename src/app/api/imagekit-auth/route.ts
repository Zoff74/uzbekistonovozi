import { NextResponse } from "next/server";
import ImageKit from "imagekit";

//src\app\api\imagekit-auth\route.ts

const urlEndpoint = process.env.IMAGEKIT_URL_ENDPOINT || process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT || "https://ik.imagekit.io/tyhsos05b";

const imagekit = new ImageKit({
    publicKey: process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY!,
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY!,
    urlEndpoint: urlEndpoint,
});

export async function GET() {
  try {
    // Явно задаем expire ровно на 30 минут вперед (в секундах)
    const expire = Math.floor(Date.now() / 1000) + 30 * 60;
    
    // Передаем expire в SDK, чтобы он сам сгенерировал корректную подпись
    const authenticationParameters = imagekit.getAuthenticationParameters(undefined, expire);

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