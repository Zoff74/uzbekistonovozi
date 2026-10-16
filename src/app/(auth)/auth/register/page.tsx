"use client";

// src/app/(auth)/auth/register/page.tsx
import { useState, useRef, ChangeEvent, FormEvent, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Loader2, LogIn, Camera, X, Eye, EyeOff } from "lucide-react";
import BackButton from "@/components/BackButton";
import FireworkCanvas from "@/components/FireworkCanvas";
import { validateRegisterForm } from "@/utils/register-validators";
import { registerUser } from "@/actions/auth.action";
import { signIn } from "next-auth/react";
import { compressImage } from "@/utils/image-compressor";
import { tr } from "@/utils/translate";
import { useLoading } from "@/context/LoadingContext"; 
import InstrumentAutocomplete from "@/components/InstrumentAutocomplete";

function RegisterForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const roleParam = searchParams.get("role");
    const { startLoading, stopLoading } = useLoading();
    
    const isListenerMode = roleParam === "listener";

    const [generalError, setGeneralError] = useState("");
    const [username, setUsername] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [phone, setPhone] = useState("");
    const [telegram, setTelegram] = useState("");
    const [role, setRole] = useState(isListenerMode ? "tinglovchi" : "musiqachi");
    
    // Динамический массив инструментов для мультиинструменталистов
    const [instrumentsList, setInstrumentsList] = useState<{ name: string; id: string }[]>([
        { name: "", id: "" }
    ]);
    
    useEffect(() => {
        if (isListenerMode) {
            setRole("tinglovchi");
        }
    }, [isListenerMode]);

    const [customOccupation, setCustomOccupation] = useState("");
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [usernameError, setUsernameError] = useState("");
    const [emailError, setEmailError] = useState("");
    const [passwordError, setPasswordError] = useState("");
    const [phoneError, setPhoneError] = useState("");
    const [telegramError, setTelegramError] = useState("");
    const [loading, setLoading] = useState(false);

    // Добавление нового поля инструмента
    const addInstrumentField = () => {
        setInstrumentsList([...instrumentsList, { name: "", id: "" }]);
    };

    // Удаление поля инструмента
    const removeInstrumentField = (index: number) => {
        const updated = instrumentsList.filter((_, i) => i !== index);
        setInstrumentsList(updated.length > 0 ? updated : [{ name: "", id: "" }]);
    };

    // Очистка памяти превью при размонтировании или смене файла
    useEffect(() => {
        return () => {
            if (avatarPreview) {
                URL.revokeObjectURL(avatarPreview);
            }
        };
    }, [avatarPreview]);

    const handleAvatarChange = async (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            try {
                let processedFile: File = file;
                if (file.size > 1024 * 1024) {
                    processedFile = await compressImage(file);
                }
                setAvatarFile(processedFile);
                
                if (avatarPreview) {
                    URL.revokeObjectURL(avatarPreview);
                }
                const previewUrl = URL.createObjectURL(processedFile);
                setAvatarPreview(previewUrl);
            } catch (err) {
                console.error("Ошибка обработки изображения:", err);
            }
        }
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (loading) return;

        setGeneralError("");
        setUsernameError("");
        setEmailError("");
        setPasswordError("");
        setPhoneError("");
        setTelegramError("");
        
        setLoading(true);
        startLoading();

        try {
            const validation = validateRegisterForm({ username, phone, password, telegram, email });

            if (!validation.isValid) {
                if (validation.usernameError) setUsernameError(validation.usernameError);
                if (validation.phoneError) setPhoneError(validation.phoneError);
                if (validation.passwordError) setPasswordError(validation.passwordError);
                if (validation.emailError) setEmailError(validation.emailError);
                if (validation.telegramError) setTelegramError(validation.telegramError);
                
                setGeneralError(tr(
                    "Илтимос, форма тўлдиришда хатоларга йўл қўйманг.",
                    "Iltimos, forma to'ldirishda xatolarga yo'l qo'ymang.",
                    "Пожалуйста, исправьте ошибки при заполнении формы.",
                    "Please correct the errors in the form."
                ));
                setLoading(false);
                stopLoading();
                return;
            }

            // Определяем финальную профессию / роль
            let finalOccupation = isListenerMode ? "tinglovchi" : role;
            if (role === "marketplace_seller") {
                finalOccupation = tr("Мусиқий асбоблар савдогари", "Musiqiy asboblar savdogari", "Продавец музыкальных инструментов", "Music Instruments Seller");
            } else if (role === "other") {
                finalOccupation = customOccupation.trim();
            }

            const systemRole = (finalOccupation === "tinglovchi") ? "user" : "savdogar";

            const formData = new FormData();
            formData.append("username", username);
            formData.append("email", email);
            formData.append("password", password);
            formData.append("phone", phone);
            formData.append("telegram", telegram);
            formData.append("occupation", finalOccupation);
            
            // Если выбран музыкант, передаем массив инструментов и слагов
            if (role === "musiqachi") {
                const validInstruments = instrumentsList.filter(i => i.name.trim());
                if (validInstruments.length > 0) {
                    formData.append("instruments", JSON.stringify(validInstruments.map(i => i.name.trim())));
                    formData.append("instrumentIds", JSON.stringify(validInstruments.map(i => i.id || i.name.toLowerCase().replace(/\s+/g, '-'))));
                    // Дублируем первый инструмент в старое поле для обратной совместимости
                    formData.append("instrument", validInstruments[0].name.trim());
                    formData.append("instrumentId", validInstruments[0].id || validInstruments[0].name.toLowerCase().replace(/\s+/g, '-'));
                    formData.append("instrumentCategory", "musiqachi");
                }
            }

            formData.append("role", systemRole);
            formData.append("createdAt", new Date().toISOString());
            
            if (avatarFile) {
                formData.append("avatar", avatarFile);
            }

            const result = await registerUser(formData);
            
            if (result.success) {
                const signInResult = await signIn("credentials", {
                    email, password, callbackUrl: "/", redirect: true
                });
                if (signInResult?.error) {
                    setGeneralError(tr(
                        `Киришда хатолик: ${signInResult.error}`,
                        `Kirishda xatolik: ${signInResult.error}`,
                        `Ошибка входа: ${signInResult.error}`,
                        `Sign in error: ${signInResult.error}`
                    ));
                    setLoading(false);
                    stopLoading();
                }
            } else {
                setGeneralError(result.message || tr(
                    "Рўйхатдан ўтишда хатолик.",
                    "Ro'yxatdan o'tishda xatolik.",
                    "Ошибка при регистрации.",
                    "Registration error."
                ));
                if (result.errorType === "EMAIL_EXISTS") setEmailError(result.message);
                else if (result.errorType === "TELEGRAM_EXISTS") setTelegramError(result.message);
                
                setLoading(false);
                stopLoading();
            }
        } catch (error: unknown) {
            console.error("РЕГИСТРАЦИЯ ХАТОЛИГИ:", error);
            const errorMessage = error instanceof Error ? error.message : "";
            setGeneralError(errorMessage || tr(
                "Номаълум хатолик. Қайтатдан уриниб кўринг.",
                "Noma'lum xatolik. Qaytadan urinib ko'ring.",
                "Неизвестная ошибка. Попробуйте еще раз.",
                "Unknown error. Please try again."
            ));
            setLoading(false);
            stopLoading();
        }
    };

    const inputBaseClass = "p-3.5 border-2 rounded-xl w-full bg-black text-white font-medium focus:outline-none transition-colors duration-300";
    const inputBorderClass = "border-[#39FF14]/50 focus:border-[#39FF14]";
    const errorInputClass = "border-red-500 focus:border-red-400";

    return (
        <div className="w-full min-h-[100vh] flex flex-col justify-center items-center relative overflow-x-hidden m-0 p-0 select-none">
            <FireworkCanvas disableClick />

            <div className="absolute top-4 left-4 z-20">
                <BackButton />
            </div>

            <div className="flex-1 flex shrink-0 items-center justify-center w-full py-16 max-[480px]:py-10 z-10">
                <div className="flex flex-col items-center justify-center gap-5 p-10 rounded-[24px] bg-black relative overflow-hidden w-[90%] max-w-[420px] shadow-[0px_0px_25px_0px_rgba(57,255,20,0.15)] max-[480px]:m-0 max-[480px]:mx-auto max-[480px]:p-5 max-[480px]:w-[92%] max-[480px]:gap-[15px] max-[480px]:rounded-[16px]"
                    style={{
                        border: '2px solid transparent',
                        borderImageSource: 'linear-gradient(to right, #030712, #39FF14, #030712)',
                        borderImageSlice: 1
                    }}>

                    <Image alt="Logo" width={160} height={160} sizes="120px" src="/img/muzikanti.webp" priority />

                    <div className="w-full flex flex-col justify-center items-center text-center">
    <span className="text-[#FFDA09] !text-[20px] font-thin antialiased leading-[1.3] tracking-tighter break-words max-w-full whitespace-pre-line" style={{ fontFamily: "'Bad Script', cursive", fontWeight: '400' }}>
        {isListenerMode ? (
            tr(
                "Мусиқа оламига Хуш келибсиз,\nМусиқа Ишқивози!",
                "Musiqa olamiga Xush kelibsiz,\nMusiqa Ishqivozi!",
                "Добро пожаловать в Мир Музыки,\nДорогой слушатель!",
                "Welcome to the world of music,\nlistener!"
            )
        ) : (
            <>
                {tr(
                    "Санъат Дунёсига Хуш Келибсиз!\n\nСанъат ва Санъат бизнесига алоқадор экансиз,\nформани тўлдиринг...",
                    "San'at Dunyosiga Xush Kelibsiz!\n\nSan'at va San'at biznesiga aloqador ekansiz,\nformani to'ldiring...",
                    "Представьте свое искусство миру!",
                    "Showcase your art to the world!"
                )}
            </>
        )}
    </span>
</div>

                    <form onSubmit={handleSubmit} autoComplete="off" className="w-full flex flex-col gap-[18px]">
                        
                        {/* Аватар */}
                        <div className="flex flex-col gap-1.5">
                            <label className="text-[13px] text-[#FFDA09] uppercase tracking-[0.5px] whitespace-pre-line">
                                {tr(
                                    "Профиль суратингиз",
                                    "Profil suratingiz",
                                    "Ваше фото профиля",
                                    "Your profile picture"
                                )}
                            </label>
                            <div onClick={() => !loading && fileInputRef.current?.click()} className={`p-3.5 border-2 border-dashed border-[#39FF14]/50 hover:border-[#39FF14] rounded-xl w-full bg-black text-white font-medium transition-all duration-300 flex items-center justify-between cursor-pointer ${loading ? "opacity-70 cursor-not-allowed pointer-events-none" : ""}`}>
                                <div className="flex items-center gap-3 overflow-hidden">
                                    {avatarPreview ? (
                                        <div className="relative w-8 h-8 rounded-lg overflow-hidden shrink-0 border border-[#39FF14]">
                                            <img src={avatarPreview} alt="Avatar Preview" className="w-full h-full object-cover" />
                                        </div>
                                    ) : (
                                        <Camera className="w-5 h-5 text-[#39FF14] shrink-0" />
                                    )}
                                    <span className="text-sm truncate text-gray-300">
                                        {avatarFile ? avatarFile.name : tr(
                                            "Босинг ва Фото суратингизни юкланг...",
                                            "Bosing va Foto suratingizni yuklang...",
                                            "Нажмите и загрузите свою фотографию...",
                                            "Click and upload your photo..."
                                        )}
                                    </span>
                                </div>
                                {avatarPreview && !loading && (
                                    <button type="button" onClick={(e) => { e.stopPropagation(); setAvatarFile(null); setAvatarPreview(null); }} className="text-red-500 hover:text-red-400 p-1 shrink-0">
                                        <X className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                            <input type="file" ref={fileInputRef} onChange={handleAvatarChange} accept="image/*" capture="environment" className="hidden" disabled={loading} />
                        </div>

                        {/* ФИО */}
                        <div className="flex flex-col gap-1.5">
                            <label htmlFor="r_u_name" className="text-[13px] text-[#FFDA09] uppercase tracking-[0.5px]">
                                {tr("Фамилия ва Исмингиз", "Familiya va Ismingiz", "Фамилия и Имя", "Full Name")}
                            </label>
                            <input 
                                type="text" 
                                placeholder="Алишеров Алишер" 
                                required 
                                id="r_u_name" 
                                name="fullName" 
                                autoComplete="name" 
                                value={username} 
                                onChange={(e) => { setUsername(e.target.value); setUsernameError(""); }} 
                                disabled={loading} 
                                className={`${inputBaseClass} ${usernameError ? errorInputClass : inputBorderClass}`} 
                            />
                            {usernameError && <p className="text-[#39FF14] text-[13px] text-center">{usernameError}</p>}
                        </div>

                        {/* ТЕЛЕФОН */}
                        <div className="flex flex-col gap-1.5">
                            <label htmlFor="r_phone_f" className="text-[13px] text-[#FFDA09] uppercase tracking-[0.5px]">
                                {tr("Телефон рақамингиз", "Telefon raqamingiz", "Номер телефона", "Phone Number")}
                            </label>
                            <input 
                                type="tel" 
                                placeholder="+998 90 123 45 67" 
                                required 
                                id="r_phone_f" 
                                name="phoneNumber" 
                                autoComplete="tel" 
                                value={phone} 
                                onChange={(e) => { setPhone(e.target.value); setPhoneError(""); }} 
                                disabled={loading} 
                                className={`${inputBaseClass} ${phoneError ? errorInputClass : inputBorderClass}`} 
                            />
                            {phoneError && <p className="text-[#39FF14] text-[13px] text-center">{phoneError}</p>}
                        </div>

                        {/* РОЛЬ / ПРОФЕССИЯ */}
                        {!isListenerMode && (
                            <>
                                <div className="flex flex-col gap-1.5">
                                    <label htmlFor="r_role" className="text-[13px] text-[#FFDA09] uppercase tracking-[0.5px]">
                                        {tr("Ким сифатида рўйхатдан ўтмоқчисиз?", "Kim sifatida ro'yxatdan o'tmoqchisiz?", "Кем вы хотите зарегистрироваться?", "What role would you like to register as?")}
                                    </label>
                                    <select 
                                        id="r_role" 
                                        value={role} 
                                        onChange={(e) => setRole(e.target.value)} 
                                        disabled={loading} 
                                        className={`${inputBaseClass} ${inputBorderClass} text-[15px]`}
                                    >
                                        <option value="musiqachi">{tr("Мусиқачи (Инструментал)", "Musiqachi (Instrumental)", "Музыкант (Инструменталист)", "Musician (Instrumentalist)")}</option>
                                        <option value="marketplace_seller">{tr("Мусиқий асбоблар савдогари", "Musiqiy asboblar savdogari", "Продавец музыкальных инструментов", "Music Instruments Seller")}</option>
                                        <option value="xonanda">{tr("Хонанда / Вокал", "Xonanda / Vokal", "Певец / Вокалист", "Singer / Vocalist")}</option>
                                        <option value="kompozitor">{tr("Композитор", "Kompozitor", "Композитор", "Composer")}</option>
                                        <option value="bastakor">{tr("Бастакор", "Bastakor", "Бастакор", "Bastakor")}</option>
                                        <option value="qo'shiq matni muallifi">{tr("Қўшиқ матни муалифи", "Qo'shiq matni muallifi", "Автор текста песни", "Lyricist")}</option>
                                        <option value="aranjirovka ustasi">{tr("Аранжировка устаси", "Aranjirovka ustasi", "Аранжировщик", "Arranger")}</option>
                                        <option value="other">{tr("✍️ Ўз вариантингиз", "✍️ O'z variantingiz", "✍️ Свой вариант", "✍️ Write your own option")}</option>
                                    </select>
                                </div>

                                {/* Динамический список инструментов для мультиинструменталистов */}
                                {role === "musiqachi" && (
                                    <div className="flex flex-col gap-3 animate-fadeIn">
                                        <label className="text-[13px] text-[#FFDA09] uppercase tracking-[0.5px]">
                                            {tr("Қайси мусиқа асбобларида ижро этасиз?\nМасалан: Пианино", "Qaysi musiqa asboblarida ijro etasiz?\nMasalan: pianino", "На каких инструментах вы играете?\nНапример: Пианино", "What instruments do you play?\ne.g., Saxophone")}
                                        </label>

                                        {instrumentsList.map((item, index) => (
                                            <div key={index} className="flex items-center gap-2">
                                                <div className="flex-1">
                                                    <InstrumentAutocomplete
                                                        value={item.name}
                                                        onChange={(name, slug) => {
                                                            const updated = [...instrumentsList];
                                                            updated[index] = { name, id: slug };
                                                            setInstrumentsList(updated);
                                                        }}
                                                        placeholder="Пианино"
                                                    />
                                                </div>
                                                {instrumentsList.length > 1 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => removeInstrumentField(index)}
                                                        className="p-3 bg-red-950/40 border border-red-500/50 rounded-xl text-red-400 hover:text-red-300 transition shrink-0"
                                                    >
                                                        ✕
                                                    </button>
                                                )}
                                            </div>
                                        ))}

                                        <button
                                            type="button"
                                            onClick={addInstrumentField}
                                            className="self-start px-3 py-1.5 bg-[#39FF14]/10 border border-[#39FF14]/40 rounded-lg text-[#39FF14] text-xs font-semibold uppercase tracking-wider hover:bg-[#39FF14]/20 transition"
                                        >
                                            + {tr("Яна мусиқа асбоб қўшиш", "Yana musiqa asbob qo'shish", "Добавить еще музыкальный инструмент", "Add another instrument")}
                                        </button>

                                        <p className="text-[15px] text-gray-200">
                                            {tr(
                                                "Бу маълумот орқали бошқалар сизни қидириб топишади.",
                                                "Bu ma'lumot orqali boshqalar sizni qidirib topishadi.",
                                                "По этим инструментам другие пользователи смогут вас найти.",
                                                "Other users will be able to find you by these instruments."
                                            )}
                                        </p>
                                    </div>
                                )}

                                {role === "marketplace_seller" && (
                                    <div className="p-3 bg-emerald-950/20 border border-[#39FF14]/30 rounded-xl animate-fadeIn">
                                        <p className="text-base text-emerald-300 leading-relaxed font-medium">
                                            {tr(
                                                "✨ Сиз «Мусиқий асбоблар олди-сотди бозори»да янги ва ишлатилган мусиқий асбобларни сотиш ҳуқуқини оласиз.",
                                                "✨ Siz «Musiqiy asboblar oldi-sotdi bozori»da yangi va ishlatilgan musiqiy asboblarni sotish huquqini olasiz.",
                                                "✨ Вы получите доступ к маркетплейсу музыкальных инструментов для продажи новых и б/у товаров.",
                                                "✨ You will get access to the music instruments marketplace to sell new and used items."
                                            )}
                                        </p>
                                    </div>
                                )}

                                {role === "other" && (
                                    <div className="flex flex-col gap-1.5 animate-fadeIn">
                                        <label htmlFor="r_custom_occupation" className="text-[13px]  text-[#FFDA09] uppercase tracking-[0.5px]">
                                            {tr("Касбингизни ёзинг \n(Продюсер, Аранжировщик...)", "Kasbingizni yozing \n(Prodyuser, Aranjirovkachi...)", "Напишите вашу профессию \n(Продюсер, Аранжировщик...)", "Write your occupation \n(Producer, Arranger...)")}
                                        </label>
                                        <input 
                                            type="text" 
                                            placeholder="Масалан: Саунд-продюсер..." 
                                            required 
                                            id="r_custom_occupation" 
                                            value={customOccupation} 
                                            onChange={(e) => setCustomOccupation(e.target.value)} 
                                            disabled={loading} 
                                            className={`${inputBaseClass} border-[#39FF14]`} 
                                        />
                                    </div>
                                )}
                            </>
                        )}

                        {/* ПОЧТА */}
                        <div className="flex flex-col gap-1.5">
                            <label htmlFor="r_email_f" className="text-[13px] text-[#FFDA09] uppercase tracking-[0.5px]">
                                {tr("E-mail", "E-mail", "E-mail", "E-mail")}
                            </label>
                            <input 
                                type="email" 
                                placeholder="alisher@mail.ru" 
                                required 
                                id="r_email_f" 
                                name="email" 
                                autoComplete="email" 
                                value={email} 
                                onChange={(e) => { setEmail(e.target.value); setEmailError(""); }} 
                                disabled={loading} 
                                className={`${inputBaseClass} ${emailError ? errorInputClass : inputBorderClass}`} 
                            />
                            {emailError && <p className="text-[#39FF14] text-[13px] text-center">{emailError}</p>}
                        </div>

                        {/* ТЕЛЕГРАМ */}
                        <div className="flex flex-col gap-1.5">
                            <label htmlFor="r_tg_f" className="text-[13px] text-[#FFDA09] uppercase tracking-[0.5px]">
                                {tr("Telegram", "Telegram", "Telegram", "Telegram")}
                            </label>
                            <input
                                type="text"
                                placeholder="@alisher"
                                id="r_tg_f"
                                name="telegramUsername"
                                autoComplete="off"
                                value={telegram}
                                onChange={(e) => {
                                    setTelegram(e.target.value);
                                    setTelegramError("");
                                }}
                                disabled={loading}
                                className={`${inputBaseClass} ${telegramError ? errorInputClass : inputBorderClass}`}
                            />
                            {telegramError && <p className="text-[#FFDA09] text-[11px] text-center">{telegramError}</p>}
                        </div>

                        {/* ПАРОЛЬ */}
                        <div className="flex flex-col gap-1.5">
                            <label htmlFor="r_pass_f" className="text-[13px] text-[#FFDA09] uppercase tracking-[0.5px]">
                                {tr("Пароль", "Parol", "Пароль", "Password")}
                            </label>
                            <div className="relative w-full">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    placeholder={tr("123456 (камида)", "123456 (kamida)", "123456 (минимум)", "123456 (minimum)")}
                                    required
                                    id="r_pass_f"
                                    name="newPassword"
                                    autoComplete="new-password"
                                    value={password}
                                    onChange={(e) => { setPassword(e.target.value); setPasswordError(""); }}
                                    disabled={loading}
                                    className={`${inputBaseClass} pr-12 ${passwordError ? errorInputClass : inputBorderClass}`}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#39FF14] transition cursor-pointer"
                                    tabIndex={-1}
                                >
                                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                </button>
                            </div>
                            {passwordError && <p className="text-[#39FF14] text-[13px] text-center">{passwordError}</p>}
                        </div>

                        {/* КНОПКА РЕГИСТРАЦИИ С ЛОАДЕРОМ */}
                        <div className="relative w-full h-[48px] group flex items-center justify-center mt-1">
                            <div className="absolute inset-0 bg-gradient-to-r from-black to-gray-600 rounded-xl z-0 shadow-[0_0_15px_rgba(57,255,20,0.2)] transition-all duration-500 group-hover:shadow-[inset_0_0_20px_rgba(0,0,0,1)]" />
                            <button 
                                type="submit"
                                disabled={loading}
                                className={`relative w-[calc(100%-4px)] h-[44px] z-10 flex items-center justify-center gap-1.5 rounded-lg border-[2px] border-transparent bg-black text-[#39FF14] text-[11px] font-bold uppercase tracking-wider transition-all duration-300 overflow-hidden ${
                                    loading 
                                        ? "opacity-80 cursor-not-allowed pointer-events-auto" 
                                        : "group-hover:scale-[0.98] group-active:scale-[0.95] group-hover:text-white cursor-pointer"
                                }`}
                                style={{ 
                                    borderImageSource: 'linear-gradient(to right, #000000, #FFDA09, #39FF14, #FFDA09, #000000)', 
                                    borderImageSlice: 1,
                                    cursor: loading ? 'not-allowed' : undefined
                                }}
                            >
                                <div className="absolute inset-0 w-full h-full pointer-events-none overflow-hidden">
                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#39FF14]/40 to-transparent -translate-x-full group-hover:animate-shimmer" />
                                </div>
                                
                                {loading ? (
                                    <>
                                        <Loader2 className="w-4 h-4 text-[#39FF14] animate-spin relative z-10" />
                                        <span className="relative z-10 drop-shadow-[0_0_5px_rgba(57,255,20,0.5)]">
                                            {tr("Юкланмоқда...", "Yuklanmoqda...", "Загрузка...", "Loading...")}
                                        </span>
                                    </>
                                ) : (
                                    <>
                                        <LogIn className="w-3.5 h-3.5 text-[#39FF14] relative z-10" />
                                        <span className="relative z-10 drop-shadow-[0_0_5px_rgba(57,255,20,0.5)]">
                                            {tr("Рўйхатдан ўтиш", "Ro'yxatdan o'tish", "Регистрация", "Sign Up")}
                                        </span>
                                    </>
                                )}
                            </button>
                        </div>

                        {generalError && (
                            <div className="p-3 bg-red-950/30 rounded-xl border border-red-500/50 text-center leading-relaxed">
                                <span 
                                    className="text-red-400 !text-[17px] font-thin antialiased tracking-tighter block"
                                    style={{ fontFamily: "'Bad Script', cursive", fontWeight: '400' }}
                                >
                                    {generalError}
                                </span>
                            </div>
                        )}
                    </form>
                </div>
            </div>
            
            <style jsx global>{`
                @keyframes shimmer {
                    100% { transform: translateX(100%); }
                }
                .animate-shimmer {
                    animation: shimmer 1.5s infinite ease-in-out;
                }
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-fadeIn {
                    animation: fadeIn 0.5s ease-out forwards;
                }
            `}</style>
        </div>
    );
}

export default function RegisterPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-black flex items-center justify-center text-[#39FF14]">Loading...</div>}>
            <RegisterForm />
        </Suspense>
    );
}