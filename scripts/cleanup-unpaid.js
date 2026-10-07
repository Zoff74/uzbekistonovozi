// scripts/cleanup-unpaid.js ЗАПУСК вручную: npm run cleanup 
const mongoose = require('mongoose');
require('dotenv').config({ path: '.env.local' });

async function runCleanup() {
    try {
        // Берем строку подключения из ваших переменных окружения (.env.local)
        const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uzbekistonovozi';
        
        await mongoose.connect(MONGODB_URI);
        console.log('[Cleanup]: Успешное подключение к MongoDB');

        // Вычисляем дату ровно 30 дней назад
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        // Условие удаления: контент не оплачен (isPaid не равно true) И создан 30+ дней назад
        const query = {
            isPaid: { $ne: true },
            createdAt: { $lte: thirtyDaysAgo }
        };

        // Подключаем модели (если они еще не зарегистрированы в контексте скрипта)
        let Track, Video;
        try {
            Track = mongoose.model('Track');
        } catch {
            Track = mongoose.model('Track', new mongoose.Schema({}, { strict: false }));
        }

        try {
            Video = mongoose.model('Video');
        } catch {
            Video = mongoose.model('Video', new mongoose.Schema({}, { strict: false }));
        }

        // Выполняем массовое удаление старого неоплаченного контента
        const deletedTracks = await Track.deleteMany(query);
        const deletedVideos = await Video.deleteMany(query);

        console.log(`[Cleanup Success]: Удалено старых неоплаченных треков: ${deletedTracks.deletedCount}, видео: ${deletedVideos.deletedCount}`);
        
        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('[Cleanup Error]: Ошибка при автоочистке базы:', error);
        process.exit(1);
    }
}

runCleanup();