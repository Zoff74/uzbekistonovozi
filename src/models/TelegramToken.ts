import mongoose, { Schema, Document, Model, Types } from "mongoose";

// src/models/TelegramToken.ts

/**
* @interface ITelegramToken
* @description Модель для хранения одноразовых токенов верификации Telegram.
* Токены используются для связывания Chat ID Telegram с User ID на сайте.
*/
export interface ITelegramToken extends Document {
  token: string;
  userId: Types.ObjectId;
  used: boolean;
  expiresAt: Date;
  chatId?: string;
}

const TelegramTokenSchema = new Schema<ITelegramToken>(
    {
        token: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },
        userId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true, // Индекс для быстрого поиска
        },
        used: {
            type: Boolean,
            required: true,
            default: false,
        },
        expiresAt: {
            type: Date,
            required: true,
            // Убрали index из описания поля, чтобы избежать дублирования при HMR
        },
        chatId: {
            type: String,
            required: false,
        }
    },
    { timestamps: true }
);

// Устанавливаем TTL-индекс здесь (в едином безопасном месте для схемы)
TelegramTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// ИСПРАВЛЕНИЕ ДЛЯ NEXT.JS: Используем условие глобального объекта Mongoose.
// eslint-disable-next-line @typescript-eslint/naming-convention
const TelegramToken = (mongoose.models.TelegramToken ||
    mongoose.model<ITelegramToken>("TelegramToken", TelegramTokenSchema)) as Model<ITelegramToken>;

export default TelegramToken;