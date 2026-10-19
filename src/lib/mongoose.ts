// src/lib/mongoose.ts
import mongoose from "mongoose";

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

let cached = (global as unknown as { mongoose: MongooseCache | undefined }).mongoose;

if (!cached) {
  cached = (global as unknown as { mongoose: MongooseCache }).mongoose = {
    conn: null,
    promise: null,
  };
}

export const dbConnect = async (): Promise<typeof mongoose> => {
  // 🛑 ЖЕСТКАЯ БЛОКИРОВКА: если идет сборка (next build), база данных НЕ вызывается вообще
  if (process.env.NEXT_PHASE === 'phase-production-build' || process.env.BUILDING === 'true' || process.env.NODE_ENV === 'production' && !process.env.PORT) {
    return mongoose;
  }

  if (cached.conn) {
    return cached.conn;
  }

  if (cached.promise) {
    return cached.promise;
  }

  const MONGODB_URI = process.env.MONGODB_URI;

  if (!MONGODB_URI) {
    throw new Error("Пожалуйста, определите переменную окружения MONGODB_URI");
  }

  const maxRetries = 3;
  const retryDelay = 1000; 
  
  cached.promise = (async () => {
    let retries = 0;
    let lastError: unknown;

    while (retries < maxRetries) {
      try {
        const connection = await mongoose.connect(MONGODB_URI, {
          serverSelectionTimeoutMS: 5000, 
          socketTimeoutMS: 15000, 
        });
        return connection;
      } catch (error) {
        lastError = error;
        retries++;
        
        if (retries >= maxRetries) break;
        await new Promise((res) => setTimeout(res, retryDelay));
      }
    }
    throw new Error(`Не удалось подключиться к базе данных после ${maxRetries} попыток. Ошибка: ${lastError}`);
  })();

  try {
    cached.conn = await cached.promise;
    return cached.conn;
  } catch (error) {
    cached.promise = null;
    throw error;
  }
};