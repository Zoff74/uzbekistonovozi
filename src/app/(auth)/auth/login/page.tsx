"use client";

// src/app/(auth)/auth/login/page.tsx
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { LogIn, Eye, EyeOff, Loader2 } from "lucide-react";
import { validateLoginForm } from "@/utils/auth-validators";
import BackButton from "@/components/BackButton";
import FireworkCanvas from "@/components/FireworkCanvas";
import { tr } from "@/utils/translate";
import { useLoading } from "@/context/LoadingContext";

export default function LoginPage() {
    const router = useRouter();
    const { startLoading, stopLoading } = useLoading();

    const [generalError, setGeneralError] = useState("");
    const [showRegisterLink, setShowRegisterLink] = useState(false);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [emailError, setEmailError] = useState("");
    const [passwordError, setPasswordError] = useState("");
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setEmail("");
        setPassword("");
    }, []);

    const handleInputChange = (field: 'email' | 'password', value: string) => {
        if (field === 'email') {
            setEmail(value);
            setEmailError("");
        } else {
            setPassword(value);
            setPasswordError("");
        }
        
        if (generalError) setGeneralError("");
        if (showRegisterLink) setShowRegisterLink(false);
    };

    const handleSubmit = async (e: any) => {
        e.preventDefault();
        if (loading) return;

        setGeneralError("");
        setEmailError("");
        setPasswordError("");
        
        setLoading(true);
        startLoading();

        try {
            const validationResult = validateLoginForm({ email, password });
            if (!validationResult.isValid) {
                if (validationResult.emailError) setEmailError(validationResult.emailError);
                if (validationResult.passwordError) setPasswordError(validationResult.passwordError);
                setGeneralError(tr("Илтимос, форма тўлдиришда хатоларга йўл қўйманг.", "Iltimos, forma to'ldirishda xatolarga yo'l qo'ymang.", "Пожалуйста, не допускайте ошибок при заполнении формы.", "Please avoid errors when filling out the form."));
                
                setLoading(false);
                stopLoading();
                return;
            }

            const { signIn } = await import("next-auth/react");

            const signInResult = await signIn("credentials", {
                email,
                password,
                redirect: false,
            });

            if (signInResult?.error) {
                setGeneralError(signInResult.error);
                setLoading(false);
                stopLoading();
                setShowRegisterLink(true);
            } else {
                router.push("/");
                router.refresh();
            }
        } catch (error) {
            setGeneralError(tr("Номаълум хатолик. Қайтатдан уриниб кўринг.", "Noma'lum xatolik. Qaytadan urinib ko'ring.", "Неизвестная ошибка. Попробуйте снова.", "Unknown error. Try again."));
            setLoading(false);
            stopLoading();
            setShowRegisterLink(true);
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

            <div className="flex-1 flex shrink-0 items-center justify-center w-full py-10 max-[480px]:py-5 z-10">
                <div className="flex flex-col items-center justify-center gap-5 p-10 rounded-[24px] bg-black relative overflow-hidden w-[90%] max-w-[420px] shadow-[0px_0px_25px_0px_rgba(57,255,20,0.15)] max-[480px]:m-0 max-[480px]:mx-auto max-[480px]:p-5 max-[480px]:w-[92%] max-[480px]:gap-[15px] max-[480px]:rounded-[16px]"
                   style={{
                       border: '2px solid transparent',
                       borderImageSource: 'linear-gradient(to right, #030712, #39FF14, #030712)',
                       borderImageSlice: 1
                   }}>

                    <div className="w-full flex flex-col justify-center items-center text-center">
                        <span className="text-[#FFDA09] !text-[18px] font-thin antialiased leading-[1.3] tracking-tighter break-words max-w-full" style={{ fontFamily: "'Bad Script', cursive", fontWeight: '400' }}>
                            {tr("Яна дийдор учрашганимиздан Ҳурсандмиз !", "Yana diydor uchrashganimizdan xursandmiz !", "Мы Очень Рады Новой Встрече!", "Glad to meet again!")}
                        </span>
                    </div>

                    <Image alt="Logo" width={160} height={160} sizes="120px" src="/img/muzikanti.webp" priority />

                    <div className="w-full flex flex-col justify-center items-center text-center">
                        <span className="text-[#FFDA09] !text-[18px] font-thin antialiased leading-[1.3] tracking-tighter break-words max-w-full whitespace-pre-line" style={{ fontFamily: "'Bad Script', cursive", fontWeight: '400' }}>
                            {tr("Ташрифингиздан дилимиз равшан ! \n Келинг Хазрати инсоним . . .\n Қадамизга ҳасанот !", "Tashrifingizdan dilimiz ravshan ! \n Keling Hazrati insonim . . .\n Qadamingizga hasanot !", "Нам стало Светло на душе от вашего визита! \n Добро пожаловать, Человек с большой буквы...\n Добро пожаловать!", "Our hearts are brightened by your visit! \n Welcome...\n Welcome!")}
                        </span>
                    </div>

                    <form onSubmit={handleSubmit} autoComplete="off" className="w-full flex flex-col gap-[18px]">
                        <div className="flex flex-col gap-1.5">
                            <label htmlFor="l_email_f" className="text-[13px] text-[#FFDA09] uppercase tracking-[0.5px]">
                                {tr("E-mail", "E-mail", "E-mail", "E-mail")}
                            </label>
                            <input
                                type="email"
                                placeholder="alisher@mail.ru"
                                required
                                id="l_email_f"
                                name="rand_email_field_x"
                                autoComplete="new-email"
                                value={email}
                                onChange={(e) => handleInputChange('email', e.target.value)}
                                disabled={loading}
                                className={`${inputBaseClass} ${emailError ? errorInputClass : inputBorderClass}`}
                            />
                            {emailError && <p className="text-[#39FF14] text-[13px] text-center">{emailError}</p>}
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label htmlFor="l_pass_f" className="text-[13px] text-[#FFDA09] uppercase tracking-[0.5px]">
                                {tr("Пароль", "Parol", "Пароль", "Password")}
                            </label>
                            <div className="relative w-full">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    placeholder={tr("123456 (камида)", "123456 (kamida)", "123456 (минимум)", "123456 (minimum)")}
                                    required
                                    id="l_pass_f"
                                    name="rand_pass_field_x"
                                    autoComplete="new-password"
                                    value={password}
                                    onChange={(e) => handleInputChange('password', e.target.value)}
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
                                            {tr("Юкланмоқда...", "Yuklanmoqda...", "Вход...", "Logging in...")}
                                        </span>
                                    </>
                                ) : (
                                    <>
                                        <LogIn className="w-3.5 h-3.5 text-[#39FF14] relative z-10" />
                                        <span className="relative z-10 drop-shadow-[0_0_5px_rgba(57,255,20,0.5)]">
                                            {tr("Кириш", "Kirish", "Вход", "Login")}
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

                        {showRegisterLink && (
                            <div className="text-center mt-2">
                                <Link 
                                    href="/auth/register" 
                                    className="text-[#FFDA09] !text-[17px] font-thin antialiased tracking-tighter hover:underline transition block"
                                    style={{ fontFamily: "'Bad Script', cursive", fontWeight: '400' }}
                                >
                                    {tr("Жамоага қўшилмаган бўлсангиз, Жамоага қўшилинг!", "Jamoaga qo'shilmagan bo'lsangiz, Jamoaga qo'shiling!", "Если вы еще не в команде, присоединяйтесь!", "If you haven't joined the team yet, join us!")}
                                </Link>
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