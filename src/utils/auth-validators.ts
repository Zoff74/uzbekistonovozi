import { tr } from "../utils/translate";

export interface LoginValidationInput {
    email?: string;
    password?: string;
}

export interface LoginValidationResult {
    isValid: boolean;
    emailError: string;
    passwordError: string;
}

export function validateLoginForm({ email = "", password = "" }: LoginValidationInput): LoginValidationResult {
    let emailError = "";
    let passwordError = "";
    let isValid = true;

    if (!email.trim()) {
        emailError = tr("E-mail киритилмаган!", "E-mail kiritilmagan!", "E-mail не введен!", "E-mail is not entered!");
        isValid = false;
    } else {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            emailError = tr("Нотоғри E-mail формати.", "Noto'g'ri E-mail formati.", "Неверный формат E-mail.", "Invalid E-mail format.");
            isValid = false;
        }
    }

    if (!password.trim()) {
        passwordError = tr("Пароль киритилмаган!", "Parol kiritilmagan!", "Пароль не введен!", "Password is not entered!");
        isValid = false;
    }

    return { isValid, emailError, passwordError };
}

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

export function validateRegisterForm({ username = "", phone = "", password = "", telegram = "", email = "" }: RegisterValidationInput): RegisterValidationResult {
    let usernameError = "";
    let emailError = "";
    let passwordError = "";
    let phoneError = "";
    let telegramError = "";
    let isValid = true;

    if (!username.trim()) { 
        usernameError = tr("Исмингиз киритилмаган!", "Ismingiz kiritilmagan!", "Имя не введено!", "Name is not entered!"); 
        isValid = false; 
    }
    
    if (!phone.trim()) { 
        phoneError = tr("Телефон рақамингиз киритилмаган!", "Telefon raqamingiz kiritilmagan!", "Номер телефона не введен!", "Phone number is not entered!"); 
        isValid = false; 
    }
    
    if (!password.trim()) {
        passwordError = tr("Пароль киритилмаган!", "Parol kiritilmagan!", "Пароль не введен!", "Password is not entered!");
        isValid = false;
    } else if (password.length < 6) {
        passwordError = tr("Пароль камида 6 та белгидан иборат бўлиши керак.", "Parol kamida 6 ta belgidan iborat bo'lishi kerak.", "Пароль должен содержать не менее 6 символов.", "Password must be at least 6 characters long.");
        isValid = false;
    }
    
    if (!telegram.trim()) {
        telegramError = tr("Telegram Username зарур!", "Telegram Username zarur!", "Требуется Telegram Username!", "Telegram Username is required!");
        isValid = false;
    } else {
        let cleanTg = telegram.trim();
        if (!cleanTg.startsWith("@")) cleanTg = "@" + cleanTg;
        const tgRegex = /^@\w{2,}$/;
        if (!tgRegex.test(cleanTg)) {
            telegramError = tr("Телеграм нотўғри форматда. Мисол: @alisher", "Telegram noto'g'ri форматда. Misol: @alisher", "Неверный формат Telegram. Пример: @alisher", "Invalid Telegram format. Example: @alisher");
            isValid = false;
        }
    }

    if (!email.trim()) {
        emailError = tr("E-mail киритилмаган!", "E-mail kiritilmagan!", "E-mail не введен!", "E-mail is not entered!");
        isValid = false;
    } else {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            emailError = tr("Нотоғри E-mail формати.", "Noto'g'ri E-mail formati.", "Неверный формат E-mail.", "Invalid E-mail format.");
            isValid = false;
        }
    }

    return { isValid, usernameError, emailError, passwordError, phoneError, telegramError };
}