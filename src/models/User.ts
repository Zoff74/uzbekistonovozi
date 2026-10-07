import mongoose, { Schema, Document, Model, HydratedDocument, Types } from "mongoose";

export interface IUser extends Document {
    username: string;
    occupation?: string | null;
    image: string;
    imageFileId?: string | null;
    email: string;
    password?: string;
    balance: number;
    followers: Types.ObjectId[];
    following: Types.ObjectId[];
    bio?: string | null;
    location?: string | null;
    address?: {
        region?: string | null;
        city?: string | null;
        district?: string | null;
        street?: string | null;
    };
    website?: string | null;
    websiteUrl?: string | null;
    phoneNumber?: string | null;
    telegram?: string | null;
    telegramChatId?: string | null;
    telegramVerificationToken?: string | null;
    isTelegramVerified: boolean;
    didBypassTelegram: boolean;
    isMassMailingActive: boolean;
    mailingPausedSince?: Date | null;
    subscriptionSegments: string[];
    settings: { receiveTelegramNotifications: boolean; };
    lastSyncDate?: Date;
    lastActiveAt?: Date;
    isFirstReportUsed: boolean;
    isFirstPostGiftUsed: boolean;
    freeCategoriesClaimed: string[];
    freeTracksCount: number; // 👈 Счетчик использованных бесплатных треков (максимум 3)
    freeVideosCount: number; // 👈 Счетчик использованных бесплатных видео (максимум 3)
    role: 'user' | 'admin' | 'savdogar';
    dailyViewCount: number;
    lastViewDate?: Date | null;
    isPro: boolean;
    proUntil?: Date | null;
    postsCount: number;
    likesCount: number;
    givenLikesCount: number;
    receivedReviewsCount: number;
    givenCommentsCount: number;
    followingCount: number;
    followersCount: number;
    createdAt?: Date;
    updatedAt?: Date;
}

const userSchema = new Schema<IUser>({
    username: { type: String, required: true, trim: true },
    occupation: { type: String, required: false, trim: true, default: "", maxlength: 100 },
    image: { type: String, required: true, default: "/img/avatar.webp", set: (v: string) => (v && v.trim() !== "" ? v : "/img/avatar.webp")},
    imageFileId: { type: String, required: false },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
    balance: { type: Number, required: true, default: 0 },
    followers: [{ type: Schema.Types.ObjectId, ref: "User" }],
    following: [{ type: Schema.Types.ObjectId, ref: "User" }],
    bio: { type: String, required: false, trim: true, maxlength: 280 },
    location: { type: String, required: false, trim: true, maxlength: 50 },
    address: {
        region: { type: String, required: false, trim: true, default: "" },
        city: { type: String, required: false, trim: true, default: "" },
        district: { type: String, required: false, trim: true, default: "" },
        street: { type: String, required: false, trim: true, default: "" }
    },
    website: { type: String, required: false, trim: true, maxlength: 100 },
    websiteUrl: { type: String, required: false, trim: true, maxlength: 100 },
    phoneNumber: { type: String, required: false, trim: true, maxlength: 20 },
    telegram: { type: String, required: false, trim: true, maxlength: 50 },
    telegramChatId: { type: String, required: false, trim: true, sparse: true },
    telegramVerificationToken: { type: String, required: false, trim: true, sparse: true, select: false },
    isTelegramVerified: { type: Boolean, required: true, default: false },
    didBypassTelegram: { type: Boolean, required: true, default: false },
    isMassMailingActive: { type: Boolean, required: true, default: true },
    mailingPausedSince: { type: Date, required: false, default: null },
    subscriptionSegments: { type: [String], required: true, default: [] },
    settings: {
        type: { receiveTelegramNotifications: { type: Boolean, required: true, default: true } },
        default: () => ({ receiveTelegramNotifications: true }),
    },
    lastSyncDate: { type: Date, required: true, default: Date.now },
    lastActiveAt: { type: Date, required: true, default: Date.now },
    isFirstReportUsed: { type: Boolean, required: true, default: false },
    isFirstPostGiftUsed: { type: Boolean, required: true, default: false },
    freeCategoriesClaimed: { type: [String], required: true, default: [] },
    freeTracksCount: { type: Number, required: true, default: 0 }, // 👈 Инициализация счетчика треков
    freeVideosCount: { type: Number, required: true, default: 0 }, // 👈 Инициализация счетчика видео
    role: { 
        type: String, 
        required: true, 
        enum: ['user', 'admin', 'savdogar'], 
        default: 'user' 
    },
    dailyViewCount: { type: Number, required: true, default: 0 },
    lastViewDate: { type: Date, required: false, default: null },
    isPro: { type: Boolean, required: true, default: false },
    proUntil: { type: Date, required: false, default: null },
    postsCount: { type: Number, required: true, default: 0 },
    likesCount: { type: Number, required: true, default: 0 },
    givenLikesCount: { type: Number, required: true, default: 0 },
    receivedReviewsCount: { type: Number, required: true, default: 0 },
    givenCommentsCount: { type: Number, required: true, default: 0 },
    followingCount: { type: Number, required: true, default: 0 },
    followersCount: { type: Number, required: true, default: 0 },
}, { timestamps: true });

userSchema.index({ lastActiveAt: -1 });
userSchema.index({ createdAt: -1 });

userSchema.virtual('id').get(function (this: HydratedDocument<IUser>) { return this._id.toString(); });

const cleanUsernameTransform = (doc: any, ret: any) => {
    if (ret.username) {
        ret.username = ret.username.replace(/-[a-zA-Z0-9]{4,6}$/, '');
    }
    return ret;
};

userSchema.set('toJSON', { 
    virtuals: true, 
    transform: cleanUsernameTransform 
});

userSchema.set('toObject', { 
    virtuals: true, 
    transform: cleanUsernameTransform 
});

const User = (mongoose.models && mongoose.models.User)
    ? (mongoose.models.User as Model<IUser>)
    : mongoose.model<IUser>("User", userSchema);

export default User;