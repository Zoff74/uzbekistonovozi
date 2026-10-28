// scripts/cleanup-unpaid.js
// ЗАПУСК: npm run cleanup (или по cron)
const mongoose = require('mongoose');
require('dotenv').config({ path: '.env.local' });

async function runCleanup() {
    try {
        const MONGODB_URI = process.env.MONGODB_URI;
        if (!MONGODB_URI) {
            throw new Error("MONGODB_URI не найден в .env.local");
        }
        
        await mongoose.connect(MONGODB_URI);
        console.log('[Cleanup]: Успешное подключение к MongoDB');

        const now = new Date();

        // Условия поиска контента, у которого истек срок (expiresAt наступил или прошел) и он не оплачен
        const query = {
            expiresAt: { $lte: now },
            $or: [
                { isPaid: { $ne: true } },
                { isPaidActive: { $ne: true } },
                { status: { $ne: 'EXPIRED' } }
            ]
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

        // ВНИМАНИЕ: Никакого удаления! Только перевод в статус EXPIRED, 
        // чтобы контент оставался на сайте, но авторы перестали получать деньги.
        const updatedTracks = await Track.updateMany(query, { $set: { status: 'EXPIRED', isPaidActive: false } });
        const updatedVideos = await Video.updateMany(query, { $set: { status: 'EXPIRED', isPaidActive: false } });

        console.log(`[Cleanup Success]: Переведено в статус EXPIRED (без удаления): треков: ${updatedTracks.modifiedCount}, видео: ${updatedVideos.modifiedCount}`);
        
        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('[Cleanup Error]: Ошибка при обновлении статусов просроченного контента:', error);
        process.exit(1);
    }
}

runCleanup();