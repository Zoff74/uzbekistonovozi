import mongoose, { Schema, Document, Model } from "mongoose";


export interface IRegistrationLog extends Document {
  email: string;
  username: string; // Заменяем displayName и slug
  telegram?: string;
  didBypassTelegram: boolean;
  createdAt: Date;
}

const registrationLogSchema = new Schema<IRegistrationLog>({
  email: { type: String, required: true, index: true },
  username: { type: String, required: true }, // Используем только username
  telegram: { type: String, required: false },
  didBypassTelegram: { type: Boolean, required: true },
}, { timestamps: true });

// ИСПРАВЛЕНО: добавлена проверка mongoose.models для предотвращения ошибки undefined
const RegistrationLog = (mongoose.models && mongoose.models.RegistrationLog) 
  ? (mongoose.models.RegistrationLog as Model<IRegistrationLog>) 
  : mongoose.model<IRegistrationLog>("RegistrationLog", registrationLogSchema);

export default RegistrationLog;