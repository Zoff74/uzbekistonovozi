import mongoose, { Schema, Document, Model } from "mongoose";

export interface ICategory extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  icon?: string;
  createdAt: Date;
}

const CategorySchema = new Schema<ICategory>(
  {
    name: { type: String, required: true, unique: true },
    icon: { type: String, default: "Music" },
  },
  { 
    timestamps: true,
    collection: "categories" // <--- Жёстко привязываем к твоей коллекции в базе
  }
);

// Сбрасываем кэш модели, чтобы Next.js при горячей перезагрузке пересоздал её правильно
if (mongoose.models.Category) {
  delete mongoose.models.Category;
}

const Category = mongoose.model<ICategory>("Category", CategorySchema);

export default Category;