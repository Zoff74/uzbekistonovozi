"use server";

//src\actions\auth.action.ts
import { notifyAdmin } from "./telegram.action";
import { uploadImageBase64 } from "./imagekit.action";
import { tr } from "@/utils/translate";

const TELEGRAM_USERNAME_REGEX = /^[a-zA-Z0-9_]{5,}$/;
// Передаем просто подпапку, а главный корень (uzbekistonovozi) подставится автоматически внутри uploadImageBase64
const TARGET_AVATAR_FOLDER = "avatars";

export async function registerUser(formData: FormData) {
    console.log("DEBUG_REGISTRATION_START: Request Received");
    for (const [key, value] of formData.entries()) {
        const val = value instanceof File ? `File: ${value.name} (${value.size} bytes)` : value;
        console.log(`Field: ${key} | Value: ${val}`);
    }

    try {
        const { dbConnect } = await import("@/lib/mongoose");
        const User = (await import("@/models/User")).default;
        const RegistrationLog = (await import("@/models/RegistrationLog")).default;
        const bcrypt = (await import("bcryptjs")).default;

        await dbConnect();

        const username = formData.get("username") as string;
        const email = formData.get("email") as string;
        const password = formData.get("password") as string;
        const telegramRaw = (formData.get("telegram") as string)?.trim();
        const phoneNumber = (
            formData.get("phoneNumber") || 
            formData.get("phone") || 
            formData.get("r_phone_f") || 
            ""
        ) as string; 
        
        // Получаем профессию из формы (учитываем вариант "other" и кастомный ввод)
        const rawOccupation = (formData.get("occupation") as string) || 'tinglovchi';
        const customOccupation = (formData.get("customOccupation") as string)?.trim();
        
        const selectedOccupation = rawOccupation === 'other' && customOccupation ? customOccupation : rawOccupation;
        
        // Логика: Тингловчи и User — это одно и то же. Если это не тингловчи, то он становится продавцом (savdogar).
        const systemRole = selectedOccupation === 'tinglovchi' ? 'user' : 'savdogar';

        const avatarFile = formData.get("avatar") as File | null;

        // Сохраняем имя пользователя в чистом виде без slugify и технических хвостов
        let finalUsername = username ? username.trim() : "";
        let normalizedTelegram = null;

        // Валидируем Telegram только если он реально введен пользователем
        if (telegramRaw) {
            normalizedTelegram = telegramRaw.startsWith('@') ? telegramRaw.substring(1) : telegramRaw;
            if (!TELEGRAM_USERNAME_REGEX.test(normalizedTelegram)) {
                return { 
                    success: false, 
                    errorType: "TELEGRAM_INVALID", 
                    message: tr(
                        "Хатолик: Telegram Username нотўғри форматда киритилган.",
                        "Xatolik: Telegram Username noto'g'ri formatda kiritilgan.",
                        "Ошибка валидации: Некорректный формат Telegram Username.",
                        "Validation error: Incorrect Telegram Username format."
                    ) 
                };
            }
        }

        const checkQuery: any[] = [{ email }];
        if (normalizedTelegram) {
            checkQuery.push({ telegram: normalizedTelegram });
        }

        const existingUser = await User.findOne({ $or: checkQuery });

        if (existingUser) {
            if (existingUser.email === email) {
                return { 
                    success: false, 
                    errorType: "EMAIL_EXISTS", 
                    message: tr(
                        "Бу электрон почта билан бошқа Ҳазрати инсон рўйхатдан ўтган",
                        "Bu email bilan boshqa Hazrati inson ro'yxatdan o'tgan",
                        "Этот email уже зарегистрирован другим пользователем",
                        "This email is already registered by another user"
                    ) 
                };
            }
            if (normalizedTelegram && existingUser.telegram === normalizedTelegram) {
                return { 
                    success: false, 
                    errorType: "TELEGRAM_EXISTS", 
                    message: tr(
                        "Бу Telegram Username билан бошқа Ҳазрати инсон рўйхатдан ўтган",
                        "Bu Telegram Username bilan boshqa Hazrati inson ro'yxatdan o'tgan",
                        "Этот Telegram Username уже зарегистрирован другим пользователем",
                        "This Telegram Username is already registered by another user"
                    ) 
                };
            }
        }

        let avatarPath = "/img/avatar.webp";
        let imageFileId = null;

        if (avatarFile && avatarFile.size > 0) {
            try {
                const bytes = await avatarFile.arrayBuffer();
                const buffer = Buffer.from(bytes);
                const base64Image = `data:${avatarFile.type || 'image/webp'};base64,${buffer.toString("base64")}`;

                const uploadResult = await uploadImageBase64(
                    base64Image,
                    `avatar-reg-${Date.now()}`,
                    TARGET_AVATAR_FOLDER
                );

                if (uploadResult.success && uploadResult.url) {
                    avatarPath = uploadResult.url;
                    imageFileId = uploadResult.fileId;
                }
            } catch (fileErr) {
                console.error("Ошибка при загрузке аватара в ImageKit:", fileErr);
            }
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = await User.create({
            username: finalUsername,
            email,
            password: hashedPassword,
            phoneNumber: phoneNumber,
            image: avatarPath,
            imageFileId: imageFileId,
            telegram: normalizedTelegram,
            occupation: selectedOccupation, 
            role: systemRole,             
            isTelegramVerified: false,
            didBypassTelegram: false,
            isMassMailingActive: true,
            subscriptionSegments: [],
            lastSyncDate: new Date(),
            lastActiveAt: new Date(),
            isFirstReportUsed: false,
            isFirstPostGiftUsed: false,
            isPro: false,
            postsCount: 0,
            likesCount: 0,
            givenLikesCount: 0,
            receivedReviewsCount: 0,
            givenCommentsCount: 0,
            followingCount: 0,
            followersCount: 0,
        });

        try {
            await RegistrationLog.create({
                email, username: finalUsername, telegram: normalizedTelegram, didBypassTelegram: false
            });
        } catch (dbErr) {
            console.error("Ошибка записи в лог БД:", dbErr);
        }

        try {
            const adminMessage = `🎉 **НОВЫЙ ПОЛЬЗОВАТЕЛЬ!**\n\nИмя: **${newUser.username}**\nEmail: ${newUser.email}\nТелефон: ${phoneNumber || '❌'}\nАмплуа: ${selectedOccupation}\nРоль (система): ${systemRole}\nTelegram: ${newUser.telegram ? `@${newUser.telegram}` : '❌ (Керакли маълумот киритилмаган)'}`;
            notifyAdmin(adminMessage);
        } catch (tgError) {
            console.error("Telegram недоступен.");
        }

        return { success: true, username: newUser.username };
    } catch (error: any) {
        console.error("🔥 ТОЧНАЯ ОШИБКА РЕГИСТРАЦИИ:", error.message);
        if (error.errors) {
            console.error("🔥 ОШИБКИ ВАЛИДАЦИИ МОДЕЛИ:", JSON.stringify(error.errors, null, 2));
        }
        return {
            success: false,
            errorType: "SERVER_ERROR",
            message: tr(
                `Хатолик юз берди: ${error.message}`,
                `Xatolik yuz berди: ${error.message}`,
                `Произошла ошибка: ${error.message}`,
                `An error occurred: ${error.message}`
            ),
        };
    }
}

export async function getUserByEmailAndPassword(email: string, password: string) {
    try {
        const { dbConnect } = await import("@/lib/mongoose");
        const User = (await import("@/models/User")).default;
        const bcrypt = (await import("bcryptjs")).default;

        await dbConnect();
        const user = await User.findOne({ email }).select('+password').exec();
        
        if (!user) {
            console.log("Пользователь не найден");
            return null;
        }

        const isMatch = await bcrypt.compare(password, user.password as string);
        if (!isMatch) {
            console.log("Неверный пароль");
            return null;
        }

        return user.toObject();
    } catch (error) {
        console.error("Ошибка при поиске пользователя:", error);
        return null;
    }
}