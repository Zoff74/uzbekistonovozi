"use server";
// src/actions/telegram.action.ts
import { Telegraf } from 'telegraf';
import { InlineKeyboardMarkup as TelegramInlineKeyboardMarkup, ParseMode } from '@telegraf/types';
import mongoose, { Types } from 'mongoose';
import TelegramToken from '@/models/TelegramToken';
import User from '@/models/User';
import { dbConnect } from '@/lib/mongoose';
import { nanoid } from 'nanoid';

const BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME || 'UzbekistonOvoziBot';
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;

// Инстанс ОСНОВНОГО бота
function getBotInstance() {
    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    if (!BOT_TOKEN) return null;
    if (!(global as any).tgBotInstance) (global as any).tgBotInstance = new Telegraf(BOT_TOKEN);
    return (global as any).tgBotInstance;
}

// Инстанс бота для рассылок
function getMailingBotInstance() {
    const MAILING_TOKEN = process.env.TELEGRAM_BOT_TOKEN_FOR_HANDLER || process.env.TELEGRAM_BOT_TOKEN;
    if (!MAILING_TOKEN) return null;
    if (!(global as any).tgMailingBotInstance) (global as any).tgMailingBotInstance = new Telegraf(MAILING_TOKEN);
    return (global as any).tgMailingBotInstance;
}

export async function sendTelegramNotification(
    recipientChatId: string, 
    message: string, 
    parseMode: ParseMode = 'HTML', 
    replyMarkup?: TelegramInlineKeyboardMarkup,
    isMailing: boolean = false
): Promise<boolean> {
    const bot = isMailing ? getMailingBotInstance() : getBotInstance();
    
    if (!bot || !recipientChatId || ["null", "undefined", ""].includes(recipientChatId)) {
        console.error("Ошибка: Бот не инициализирован или неверный ChatID:", recipientChatId);
        return false;
    }
    try {
        await bot.telegram.sendMessage(recipientChatId, message, { 
            parse_mode: parseMode, 
            link_preview_options: { is_disabled: true }, 
            reply_markup: replyMarkup 
        });
        return true;
    } catch (error) {
        console.error(`ОШИБКА TG API (${isMailing ? 'Рассылка' : 'Личное'}):`, error);
        if (error instanceof Error && (error as any).code === 403) {
            await updateSubscriptionStatusByChatId(recipientChatId, false, true);
        }
        return false;
    }
}

export async function sendTelegramPhotoForBroadcast(
    chatId: string, 
    photoUrl: string, 
    caption: string,
    parseMode: ParseMode = 'HTML',
    replyMarkup?: TelegramInlineKeyboardMarkup,
    isMailing: boolean = false
): Promise<{ success: boolean; error?: string }> {
    const bot = isMailing ? getMailingBotInstance() : getBotInstance();
    
    if (!bot || !chatId || chatId === "null") return { success: false, error: "Бот не инициализирован" };
    try {
        await bot.telegram.sendPhoto(chatId, photoUrl, { 
            caption, 
            parse_mode: parseMode,
            reply_markup: replyMarkup
        });
        return { success: true };
    } catch (error: any) {
        console.error("ОШИБКА ПРИ ОТПРАВКЕ ФОТО:", error.message);
        if (error.code === 403) await updateSubscriptionStatusByChatId(chatId, false, true);
        return { success: false, error: error.message };
    }
}

export async function notifyUserByMessage(userId: string | Types.ObjectId, message: string): Promise<boolean> {
    try {
        await dbConnect();
        const user = await User.findById(userId).select('telegramChatId settings').lean();
        if (!user || !user.telegramChatId || user.telegramChatId === "null") return false;

        return sendTelegramNotification(user.telegramChatId, message);
    } catch (error) { 
        console.error("Ошибка в notifyUserByMessage:", error);
        return false; 
    }
}

export async function notifyAdmin(message: string, replyMarkup?: TelegramInlineKeyboardMarkup): Promise<boolean> {
    if (!ADMIN_CHAT_ID) return false;
    return sendTelegramNotification(ADMIN_CHAT_ID, message, 'HTML', replyMarkup);
}

export async function generateTelegramActivationLink(identifier: string): Promise<string> {
    try {
        await dbConnect();
        const user = await User.findOne({ 
            $or: [
                { _id: mongoose.isValidObjectId(identifier) ? identifier : null }, 
                { username: identifier }
            ] 
        }).select('_id').lean();
        
        if (!user) throw new Error("Пользователь не найден");
        await TelegramToken.deleteMany({ userId: user._id });
        const token = nanoid(12);
        await TelegramToken.create({ userId: user._id, token, expiresAt: new Date(Date.now() + 3600000) });
        return `https://t.me/${BOT_USERNAME}?start=${token}`;
    } catch (error) {
        console.error("Ошибка генерации ссылки:", error);
        return `https://t.me/${BOT_USERNAME}`;
    }
}

export async function updateSubscriptionStatusByChatId(chatId: string, status: boolean, forceUnsubscribe: boolean = false): Promise<{ success: boolean, message: string }> {
    try {
        await dbConnect();
        const update = { 'settings.receiveTelegramNotifications': status };
        if (forceUnsubscribe) {
            await User.updateOne({ telegramChatId: chatId }, update).exec();
            return { success: true, message: "Подписка отключена." };
        }
        const result = await User.findOneAndUpdate({ telegramChatId: chatId }, update, { new: true }).exec();
        return result ? { success: true, message: "Статус обновлен." } : { success: false, message: "Аккаунт не найден." };
    } catch { return { success: false, message: "Ошибка сервера." }; }
}

export async function verifyAndLinkTelegram(token: string, chatId: string): Promise<{ success: boolean, message: string }> {
    try {
        await dbConnect();
        if (!chatId || ["null", "undefined"].includes(chatId)) return { success: false, message: "Некорректный ID." };
        const alreadyLinked = await User.findOne({ telegramChatId: chatId }).select('_id').lean();
        if (alreadyLinked) return { success: true, message: "Аккаунт уже привязан." };
        const telegramToken = await TelegramToken.findOne({ token }).exec();
        if (!telegramToken) return { success: false, message: "Неверный токен." };
        if (telegramToken.expiresAt < new Date()) {
            await TelegramToken.deleteOne({ token });
            return { success: false, message: "Срок истек." };
        }
        await User.updateMany({ telegramChatId: chatId }, { $unset: { telegramChatId: 1 }, $set: { isTelegramVerified: false } }).exec();
        const user = await User.findByIdAndUpdate(telegramToken.userId, { $set: { telegramChatId: chatId, isTelegramVerified: true, 'settings.receiveTelegramNotifications': true } }, { new: true }).exec();
        await TelegramToken.deleteOne({ token });
        
        if (user) {
            const userName = user.username ? `@${user.username}` : "Мусиқачи";
            await sendTelegramNotification(
                chatId, 
                `🎵 Табриклаймиз, ${userName}! Сизнинг Telegram аккаунтиниз «Ўзбекистон овози» мусиқий экосистемасига муваффақиятли уланди.`
            );
        }
        
        return user ? { success: true, message: "Успешно привязано." } : { success: false, message: "Ошибка." };
    } catch { return { success: false, message: "Ошибка при привязке." }; }
}

export async function checkTelegramLinkStatusServer(userId: string | Types.ObjectId): Promise<{ isVerified: boolean }> {
    await dbConnect();
    const identifier = userId.toString();
    const query = mongoose.isValidObjectId(identifier) ? { _id: identifier } : { username: identifier };
    const user = await User.findOne(query).select('isTelegramVerified telegramChatId').lean();
    return { isVerified: !!(user?.isTelegramVerified && user?.telegramChatId && user.telegramChatId !== "null") };
}

export async function checkMailingBotAccess(chatId: string): Promise<boolean> {
    const bot = getMailingBotInstance();
    if (!bot || !chatId || ["null", "undefined", ""].includes(chatId)) return false;

    try {
        await bot.telegram.sendChatAction(chatId, 'typing');
        return true;
    } catch (error) {
        return false;
    }
}

/**
 * Уведомление автора о продаже трека / зачислении гонорара (50/50)
 */
export async function notifyAuthorAboutSale(chatId: string, trackTitle: string, earnedAmount: number): Promise<boolean> {
    const message = `💰 <b>ЯНГИ СОТУВ!</b>\n\nСизнинг <b>«${trackTitle}»</b>  харид қилинди.\n💵 Балансингизга гонорар қўшилди: <b>${earnedAmount.toLocaleString()} сум</b>`;
    return sendTelegramNotification(chatId, message, 'HTML', undefined, false);
}