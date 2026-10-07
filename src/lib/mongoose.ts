//src\lib\mongoose.ts
import mongoose from "mongoose";

// Интерфейс для кэша подключения.
// Кэш нужен, чтобы избежать повторных подключений при горячей перезагрузке Next.js.
interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

// Проверяем, существует ли глобальная переменная для кэша.
// Next.js сохраняет глобальные переменные между перезагрузками.
let cached = (global as unknown as { mongoose: MongooseCache | undefined }).mongoose;

if (!cached) {
  cached = (global as unknown as { mongoose: MongooseCache }).mongoose = {
    conn: null,
    promise: null,
  };
}

/**
 * @description СТРОГАЯ ПРОВЕРКА ПРИВИЛЕГИЙ (Zoff74 Policy)
 * Исполняет инструкцию: Администрировать может только пользователь Zoff74.
 * Учитывает режим тестирования через переменную NEXT_PUBLIC_TEST_MODE.
 */
const enforceSecurityPolicy = () => {
  const MASTER_ID = process.env.ADMIN_RECEIVER_ID || "";
  const isTestMode = process.env.NEXT_PUBLIC_TEST_MODE === "true";
  const currentEnvList = process.env.PRIVILEGED_USER_IDS_LIST || "";
  
  const ids = currentEnvList.split(',').map(id => id.trim()).filter(id => id.length > 0);
  const unauthorized = ids.filter(id => id !== MASTER_ID);

  // Если не тест, и в списке есть кто-то кроме тебя — чистим принудительно
  if (!isTestMode && unauthorized.length > 0) {
    console.warn("🚫 ВНИМАНИЕ: ОБНАРУЖЕНЫ ПОСТОРОННИЕ ID В PRIVILEGED_USER_IDS_LIST!");
    console.warn(`🚫 УДАЛЕНЫ ИЗ СЕССИИ: ${unauthorized.join(", ")}`);
    console.warn("👑 ПРАВИЛО: АДМИНИСТРИРОВАТЬ МОЖЕТ ТОЛЬКО ПОЛЬЗОВАТЕЛЬ ZOFF74.");
    
    // Принудительно чистим список в памяти, оставляя только тебя
    process.env.PRIVILEGED_USER_IDS_LIST = MASTER_ID;
  }
};

/**
 * @description Устанавливает соединение с MongoDB.
 * Использует кэширование для предотвращения множественных подключений.
 * @returns {Promise<typeof mongoose>} Возвращает промис с объектом соединения Mongoose.
 */
export const dbConnect = async (): Promise<typeof mongoose> => {
  // 1. Если уже есть подключенное соединение, возвращаем его.
  if (cached.conn) {
    return cached.conn;
  }

  // 2. Если промис уже существует (то есть идет процесс подключения), возвращаем его.
  if (cached.promise) {
    return cached.promise;
  }

  const MONGODB_URI = process.env.MONGODB_URI;

  // 3. Проверяем наличие переменной окружения.
  if (!MONGODB_URI) {
    throw new Error("Пожалуйста, определите переменную окружения MONGODB_URI в файле .env.local");
  }

  // --- ВЫПОЛНЕНИЕ ИНСТРУКЦИЙ ПО БЕЗОПАСНОСТИ ---
  enforceSecurityPolicy();

  // 4. Создаем новый промис для подключения.
  // 10 попыток с фиксированной паузой для устойчивости при кратковременных обрывах сети.
  const maxRetries = 10;
  const retryDelay = 2000; // Фиксировано 2 секунды между попытками
  
  cached.promise = (async () => {
    let retries = 0;
    let lastError: unknown;

    while (retries < maxRetries) {
      try {
        const connection = await mongoose.connect(MONGODB_URI, {
          serverSelectionTimeoutMS: 5000, 
          socketTimeoutMS: 10000, 
        });
        return connection;
      } catch (error) {
        lastError = error;
        retries++;
        
        if (retries >= maxRetries) break;

        console.error(`MongoDB: Ошибка подключения. Повторная попытка (${retries}/${maxRetries}) через ${retryDelay / 1000}s.`);
        await new Promise((res) => setTimeout(res, retryDelay));
      }
    }
    // Если все попытки провалились
    throw new Error(`Не удалось подключиться к базе данных после ${maxRetries} попыток. Последняя ошибка: ${lastError}`);
  })();

  // 5. Ожидаем завершения промиса и сохраняем соединение.
  try {
    cached.conn = await cached.promise;
    return cached.conn;
  } catch (error) {
    // В случае ошибки сбрасываем промис и выбрасываем исключение.
    cached.promise = null;
    throw error; // Перебрасываем ошибку, чтобы она была обработана выше
  }
};