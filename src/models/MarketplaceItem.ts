//src/models/MarketplaceItem.ts
import mongoose, { Schema, Document, Model } from "mongoose";

export interface IMarketplaceItem extends Document {
  title: string;
  price: number;
  currency: string;
  image: string;
  category: string;
  description?: string;
  seller: string;
  sellerId: mongoose.Types.ObjectId | string;
  phone?: string;
  telegram?: string;
  createdAt: Date;
}

const MarketplaceItemSchema = new Schema<IMarketplaceItem>(
  {
    title: { type: String, required: true, trim: true },
    price: { type: Number, required: true },
    currency: { type: String, default: "сўм" },
    image: { type: String, required: true },
    category: { type: String, default: "Мусиқа асбоблари" },
    description: { type: String, default: "" },
    seller: { type: String, required: true },
    sellerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    phone: { type: String, default: "" },
    telegram: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

const MarketplaceItem: Model<IMarketplaceItem> =
  mongoose.models.MarketplaceItem ||
  mongoose.model<IMarketplaceItem>("MarketplaceItem", MarketplaceItemSchema);

export default MarketplaceItem;