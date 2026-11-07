//ЗАПУСК: node scripts/generate-session.js
require("dotenv").config({ path: ".env.local" });
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const input = require("input");

const apiId = Number(process.env.TELEGRAM_API_ID || 0);
const apiHash = process.env.TELEGRAM_API_HASH || "";

if (!apiId || !apiHash) {
    console.error("❌ Ошибка: TELEGRAM_API_ID или TELEGRAM_API_HASH не найдены в .env.local!");
    process.exit(1);
}

(async () => {
    console.log("🔄 Запуск авторизации в Telegram через MTProto...");
    const client = new TelegramClient(new StringSession(""), apiId, apiHash, {
        connectionRetries: 5,
    });

    await client.start({
        phoneNumber: async () => await input.text("📱 Введи свой номер телефона (в формате +998...): "),
        password: async () => await input.text("🔑 Введи пароль двухэтапной аутентификации (если есть): "),
        phoneCode: async () => await input.text("📬 Введи код подтверждения из Telegram: "),
        onError: (err) => console.log("Ошибка:", err),
    });

    console.log("\n✅ Авторизация успешна!");
    const sessionString = client.session.save();
    console.log("\n👇 Скопируй эту строку и добавь в .env.local как TELEGRAM_STRING_SESSION:\n");
    console.log(sessionString);
    console.log("\n");
    process.exit(0);
})();