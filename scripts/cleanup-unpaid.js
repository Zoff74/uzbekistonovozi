// scripts/cleanup-unpaid.js
// ЗАПУСК вручную: npm run cleanup
const mongoose = require('mongoose');
require('dotenv').config({ path: '.env.local' });

async function runCleanup() {
    try {
        const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uzbekistonovozi';
        
        await mongoose.connect(MONGODB_URI);
        console.log('[Cleanup]: Успешное подключение к MongoDB');

        // Вычисляем дату ровно 30 дней назад
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        // Условие для треков: не оплачены И созданы 30+ дней назад
        const trackQuery = {
            isPaid: { $ne: true },
            createdAt: { $lte: thirtyDaysAgo }
        };

        // Условие для видео: не активированы оплатой (isPaid и isPaidActive не true) И созданы 30+ дней назад
        const videoQuery = {
            isPaid: { $ne: true },
            isPaidActive: { $ne: true },
            createdAt: { $lte: thirtyDaysAgo }
        };

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

        // Выполняем очистку по раздельным и безопасным условиям
        const deletedTracks = await Track.deleteMany(trackQuery);
        const deletedVideos = await Video.deleteMany(videoQuery);

        console.log(`[Cleanup Success]: Удалено старых неоплаченных треков: ${deletedTracks.deletedCount}, видео: ${deletedVideos.deletedCount}`);
        
        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('[Cleanup Error]: Ошибка при автоочистке базы:', error);
        process.exit(1);
    }
}

runCleanup();