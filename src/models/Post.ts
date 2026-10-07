import mongoose, { Schema, Document, Model, HydratedDocument, Types } from "mongoose";
import { IUser } from "./User";
//src\models\Post.ts
export interface IPost extends Document {
    content: string;
    image: string;
    imageFileId?: string;
    
    // Новые поля для аудио и видео (клипов)
    audioUrl?: string | null;
    audioFileId?: string | null;
    videoUrl?: string | null;
    videoFileId?: string | null;
    contentType: 'audio' | 'video' | 'text'; // Тип контента

    authorId: Types.ObjectId | IUser;
    likes: Types.ObjectId[] | IUser[];
    slug?: string; 
    catSlug: string; 
    userCategory?: string | null; 
    commentsCount: number; 
    views: number;
    todayViews: number;
    viewContactAttempts: number; 
    createdAt: Date;
    updatedAt: Date;
    isAd: boolean;
    status: 'PENDING_PAYMENT' | 'AWAITING_PAYMENT' | 'ACTIVE' | 'EXPIRED';
    gracePeriodExpiresAt: Date;
    contactHidden: boolean; 
    initialFeePaid: boolean; 
    expiresAt: Date | null;
    paymentRecords: Types.ObjectId[];
}

const postSchema = new Schema<IPost>(
    {
        content: {
            type: String,
            required: true,
            trim: true,
            maxlength: 5000, 
        },
        image: {
            type: String,
            required: true,
            default: "/default-listing.png",
        },
        imageFileId: {
            type: String,
            required: false,
        },
        // Добавленные поля для музыки и клипов
        audioUrl: {
            type: String,
            required: false,
            default: null,
        },
        audioFileId: {
            type: String,
            required: false,
        },
        videoUrl: {
            type: String,
            required: false,
            default: null,
        },
        videoFileId: {
            type: String,
            required: false,
        },
        contentType: {
            type: String,
            enum: ['audio', 'video', 'text'],
            default: 'text',
            required: true,
        },

        authorId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true, 
        },
        likes: [
            {
                type: Schema.Types.ObjectId,
                ref: "User",
            },
        ],
        slug: { 
            type: String,
            required: false,
            trim: true,
        },
        catSlug: {
            type: String,
            required: true,
            default: "boshqa-khizmatlar", 
            index: true, 
        },
        userCategory: {
            type: String,
            required: false,
            trim: true,
            default: null,
        },
        commentsCount: {
            type: Number,
            default: 0,
            required: true,
        },
        views: {
            type: Number,
            default: 0,
            required: true,
        },
        todayViews: {
            type: Number,
            default: 0,
            required: true,
        },
        viewContactAttempts: {
            type: Number,
            default: 0,
            required: true,
        },
        isAd: {
            type: Boolean,
            default: true,
            required: true,
        },
        status: {
            type: String,
            enum: ['PENDING_PAYMENT', 'AWAITING_PAYMENT', 'ACTIVE', 'EXPIRED'],
            default: 'ACTIVE', // При бесплатном периоде на 10 дней статус сразу ACTIVE
            required: true,
            index: true, 
        },
        gracePeriodExpiresAt: {
            type: Date,
            required: true,
            default: () => new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // 10 дней бесплатного периода по умолчанию!
        },
        contactHidden: {
            type: Boolean,
            default: false,
            required: true,
        },
        initialFeePaid: {
            type: Boolean,
            default: false,
            required: true,
        },
        expiresAt: {
            type: Date,
            required: false,
            default: () => new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), 
        },
        paymentRecords: [
            {
                type: Schema.Types.ObjectId,
                ref: 'Payment',
                required: false,
            }
        ]
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// Индексы для сортировки, фильтрации и быстрого подсчета
postSchema.index({ createdAt: -1 });
postSchema.index({ status: 1, catSlug: 1, createdAt: -1 });
postSchema.index({ image: 1 });
postSchema.index({ expiresAt: 1 }); // Для проверки истечения 10 дней

// ТЕКСТОВЫЙ ИНДЕКС ДЛЯ SEO И ПОИСКА
postSchema.index({ content: 'text', userCategory: 'text' });

postSchema.virtual("comments", {
    ref: "Comment", 
    localField: "_id", 
    foreignField: "postId", 
    options: { sort: { createdAt: -1 } } 
});

postSchema.virtual("author", {
    ref: "User",
    localField: "authorId",
    foreignField: "_id",
    justOne: true,
});

postSchema.virtual('id').get(function(this: HydratedDocument<IPost>) {
    return this._id.toString();
});

const Post = (mongoose.models.Post ||
    mongoose.model<IPost>("Post", postSchema)) as Model<IPost>;

export default Post;