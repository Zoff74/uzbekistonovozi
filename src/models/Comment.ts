// БЛОК - "Comment Model with Reply & Target" src\models\Comment.ts
import mongoose, { Schema, Document, Model } from "mongoose";

export interface IComment extends Document {
  targetId: string;
  targetType: string; // "track", "video", "album" и т.д.
  userId: mongoose.Types.ObjectId;
  text: string;
  parentId?: mongoose.Types.ObjectId | null;
  createdAt: Date;
}

const CommentSchema = new Schema<IComment>(
  {
    targetId: { type: String, required: true, index: true },
    targetType: { type: String, required: true, default: "track", index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, required: true, trim: true },
    parentId: { type: Schema.Types.ObjectId, ref: "Comment", default: null },
  },
  { timestamps: true }
);

export const Comment: Model<IComment> =
  mongoose.models.Comment || mongoose.model<IComment>("Comment", CommentSchema);