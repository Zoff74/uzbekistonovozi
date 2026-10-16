// src/models/Instrument.ts
import mongoose, { Schema, Document } from "mongoose";

export interface IInstrument extends Document {
  name: string;             // Отображаемое название (например, "Джембе")
  slug: string;             // Уникальный слаг (например, "djembe")
  category: string;         // Главная категория (например, "udarnye")
  usageCount: number;       // Сколько музыкантов выбрали этот инструмент
}

const InstrumentSchema = new Schema<IInstrument>({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, index: true },
  category: { type: String, required: true, index: true },
  usageCount: { type: Number, default: 1 }
}, { timestamps: true });

export default mongoose.models.Instrument || mongoose.model<IInstrument>("Instrument", InstrumentSchema);
