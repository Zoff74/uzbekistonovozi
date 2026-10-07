import { Schema, model, models, Document, Types } from "mongoose";
import { IUser } from "./User";

export interface IVideo extends Document {
  title: string;
  singer: string;         
  duration?: string;
  videoUrl: string; 
  videoFileId?: string;
  cover: string;    
  coverFileId?: string;
  views: number;       
  downloadsCount: number; 
  likes: Types.ObjectId[] | IUser[];
  authorId: Types.ObjectId | IUser; 
  categoryId?: Types.ObjectId;
  status: 'ACTIVE' | 'EXPIRED' | 'PENDING_PAYMENT';
  expiresAt?: Date | null; // 👈 Теперь может быть null, если бесплатный лимит исчерпан
  isPaidActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const VideoSchema = new Schema<IVideo>({
  title: { type: String, required: true, trim: true, maxlength: 150 },
  singer: { type: String, required: true, trim: true },
  duration: { type: String, required: false, default: "0:00" },
  
  videoUrl: { type: String, required: false, default: "" },
  videoFileId: { type: String, required: false, default: "" },
  
  cover: { type: String, required: true, default: "/default-cover.webp" },
  coverFileId: { type: String, required: false },
  
  views: { type: Number, default: 0, required: true },
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
    index: true 
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
    required: false, // 👈 Убрали жесткий обязательный дефолт, теперь контролируется через actions
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

VideoSchema.index({ createdAt: -1 });
VideoSchema.index({ views: -1 });

VideoSchema.virtual('id').get(function() {
    return this._id.toString();
});

VideoSchema.virtual("author", {
    ref: "User",
    localField: "authorId",
    foreignField: "_id",
    justOne: true,
});

export const Video = models.Video || model<IVideo>("Video", VideoSchema);