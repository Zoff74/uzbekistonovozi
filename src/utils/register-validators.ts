import { tr } from "../utils/translate";

export interface RegisterValidationInput {
    username?: string;
    phone?: string;
    password?: string;
    telegram?: string;
    email?: string;
}

export interface RegisterValidationResult {
    isValid: boolean;
    usernameError: string;
    emailError: string;
    passwordError: string;
    phoneError: string;
    telegramError: string;
}

export function validateRegisterForm({ 
    username = "", 
    phone = "", 
    password = "", 
    telegram = "", 
    email = "" 
}: RegisterValidationInput): RegisterValidationResult {
    let usernameError = "";
    let emailError = "";
    let passwordError = "";
    let phoneError = "";
    let telegramError = "";

    if (!username || username.trim().length < 2) {
        usernameError = tr("ФИО камида 2 та белгидан иборат бўлиши керак.", "FIO kamida 2 ta belgidan iborat bo'lishi kerak.", "ФИО должно содержать не менее 2 символов.", "Full name must be at least 2 characters long.");
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
        emailError = tr("Тўғри электрон почта манзилини киритинг.", "To'g'ri elektron pochta manzilini kiriting.", "Введите правильный адрес электронной почты.", "Enter a valid email address.");
    }

    if (!password || password.length < 6) {
        passwordError = tr("Пароль камида 6 та белгидан иборат бўлиши керак.", "Parol kamida 6 ta belgidan iborat bo'lishi kerak.", "Пароль должен содержать не менее 6 символов.", "Password must be at least 6 characters long.");
    }

    if (!phone || phone.replace(/\D/g, "").length < 9) {
        phoneError = tr("Телефон рақами тўлиқ киритилмаган.", "Telefon raqami to'liq kiritilmagan.", "Номер телефона введен не полностью.", "Phone number is incomplete.");
    }

    if (telegram && telegram.trim().length > 0 && telegram.trim().length < 3) {
        telegramError = tr("Телеграм аккаунти жуда қисқа.", "Telegram akkaunti juda qisqa.", "Аккаунт Telegram слишком короткий.", "Telegram account is too short.");
    }

    const isValid = !usernameError && !emailError && !passwordError && !phoneError && !telegramError;

    return {
        isValid,
        usernameError,
        emailError,
        passwordError,
        phoneError,
        telegramError,
    };
}