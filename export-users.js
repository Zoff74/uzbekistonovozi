// export-users.js УТИЛИТА ДЛЯ ВЫГРУЗКИ ЮЗЕРОВ из МОНГОДБ в ФАЙЛ в корне: users.json
//ПОДКЛЮЧЕНИЕ node export-users.js
const mongoose = require('mongoose');
const fs = require('fs');

const MONGODB_URI = "mongodb+srv://zoff74_db_user:OXVUzsAEZCp1IGc0@cluster0.xqcppys.mongodb.net/uzbekistonovozi?retryWrites=true&w=majority&appName=Cluster0";

async function exportUsers() {
  try {
    console.log("Подключаемся к MongoDB...");
    await mongoose.connect(MONGODB_URI);
    
    // Получаем список всех пользователей из коллекции 'users'
    const users = await mongoose.connection.db.collection('users').find({}).toArray();
    console.log(`Найдено пользователей: ${users.length}`);

    // Сохраняем в файл users.json
    fs.writeFileSync('users.json', JSON.stringify(users, null, 2), 'utf-8');
    console.log("Успешно! Все пользователи сохранены в файл users.json");

  } catch (error) {
    console.error("Ошибка выгрузки:", error);
  } finally {
    await mongoose.disconnect();
    process.exit();
  }
}

exportUsers();