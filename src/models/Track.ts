import { Schema, model, models, Document, Types } from "mongoose";
import { IUser } from "./User";

export interface ITrack extends Document {
    title: string;
    singer: string;
    genre: string;
    duration?: string;
    cover: string;
    coverFileId?: string;
    audioUrl: string;
    audioFileId?: string;
    fileSize?: number; // 👈 Размер аудиофайла в байтах
    telegramMessageId?: number; 
    telegramChatId?: string;    
    plays: number;
    downloadsCount: number;
    likes: Types.ObjectId[] | IUser[];
    authorId: Types.ObjectId | IUser;
    categoryId?: Types.ObjectId;
    status: 'ACTIVE' | 'EXPIRED' | 'PENDING_PAYMENT';
    expiresAt?: Date | null;
    isPaidActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const TrackSchema = new Schema<ITrack>({
    title: { type: String, required: true, trim: true, maxlength: 150 },
    singer: { type: String, required: true, trim: true },
    genre: { type: String, required: true, trim: true, default: "Pop" },
    duration: { type: String, required: false, default: "0:00" },
    
    cover: { type: String, required: true, default: "/default-cover.webp" },
    coverFileId: { type: String, required: false },
    
    audioUrl: { type: String, required: false, default: "" },
    audioFileId: { type: String, required: false, default: "" },
    fileSize: { type: Number, required: false, default: 0 }, // 👈 Сохраняем размер аудио при публикации
    telegramMessageId: { type: Number, required: false }, 
    telegramChatId: { type: String, required: false },    
    
    plays: { type: Number, default: 0, required: true },
    downloadsCount: { type: Number, default: 0, required: true },
    
    likes: [
        {
            type: Schema.Types.ObjectId,
            ref: "User",
        }
    ],
    
    authorId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
    },

    categoryId: {
        type: Schema.Types.ObjectId,
        ref: "Category",
        required: false,
        index: true,
    },
    
    status: {
        type: String,
        enum: ['ACTIVE', 'EXPIRED', 'PENDING_PAYMENT'],
        default: 'ACTIVE',
        required: true,
        index: true,
    },
    expiresAt: {
        type: Date,
        required: false,
        default: null,
    },
    isPaidActive: {
        type: Boolean,
        default: false,
        required: true,
    },
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
});

TrackSchema.index({ createdAt: -1 });
TrackSchema.index({ plays: -1 });

TrackSchema.virtual('id').get(function() {
    return this._id.toString();
});

TrackSchema.virtual("author", {
    ref: "User",
    localField: "authorId",
    foreignField: "_id",
    justOne: true,
});

export const Track = models.Track || model<ITrack>("Track", TrackSchema);