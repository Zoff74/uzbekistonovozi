const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const readline = require("readline");

const apiId = 28231622;
const apiHash = "5cb1e2eafeebdcf7be794fc4a0c9a9c2";

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

const askQuestion = (query) => {
    return new Promise((resolve) => rl.question(query, resolve));
};

async function main() {
    console.log("🔄 Генерация новой StringSession для GramJS...");
    
    // Создаем абсолютно чистую сессию
    const client = new TelegramClient(new StringSession(""), apiId, apiHash, {
        connectionRetries: 5,
    });

    await client.start({
        phoneNumber: async () => await askQuestion("Введите номер телефона (+998...): "),
        password: async () => await askQuestion("Пароль 2FA (если есть): "),
        phoneCode: async () => await askQuestion("Код из Telegram: "),
        onError: (err) => console.log(err),
    });

    console.log("\n✅ Успешно авторизовано!");
    console.log("\nВаша новая TELEGRAM_STRING_SESSION (скопируйте её целиком в .env):\n");
    console.log(client.session.save());
    
    rl.close();
    process.exit(0);
}

main();