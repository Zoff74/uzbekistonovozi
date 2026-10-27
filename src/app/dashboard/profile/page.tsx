"use client";
// src/app/dashboard/profile/page.tsx
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Save, CheckCircle2, User as UserIcon, Upload, Music, FileText, Phone, Send, Briefcase } from "lucide-react";
import { tr } from "@/utils/translate";
import { useSession } from "next-auth/react";

export default function ProfileSettingsPage() {
    const router = useRouter();
    const { data: session, update } = useSession();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploadingImage, setUploadingImage] = useState(false);
    const [successModal, setSuccessModal] = useState(false);

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [image, setImage] = useState("/img/avatar.webp");
    const [imageFileId, setImageFileId] = useState("");
    
    const [occupation, setOccupation] = useState(""); 
    const [instrument, setInstrument] = useState(""); 
    const [bio, setBio] = useState("");
    const [phone, setPhone] = useState("");
    const [telegram, setTelegram] = useState("");

    const [message, setMessage] = useState({ text: "", type: "" });

    const userId = session?.user?.id || (session?.user as any)?.email;

    useEffect(() => {
        async function fetchProfile() {
            try {
                setLoading(true);
                const res = await fetch("/api/user/profile", {
                    cache: "no-store",
                    headers: {
                        "Pragma": "no-cache",
                        "Cache-Control": "no-cache"
                    }
                });
                const data = await res.json();
                if (data.success && data.user) {
                    setName(data.user.username || "");
                    setEmail(data.user.email || "");
                    setImage(data.user.image || "/img/avatar.webp");
                    setImageFileId(data.user.imageFileId || "");
                    setOccupation(data.user.occupation || "");
                    setInstrument(data.user.instrument || "");
                    setBio(data.user.bio || "");
                    setPhone(data.user.phoneNumber || "");
                    setTelegram(data.user.telegram || "");
                }
            } catch (err) {
                console.error("Failed to load profile", err);
            } finally {
                setLoading(false);
            }
        }

        if (userId) {
            fetchProfile();
        }
    }, [userId]);

    // Загрузка аватара: без модалок, юзер просто видит фото в круге
    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadingImage(true);
        setMessage({ text: "", type: "" });

        const formData = new FormData();
        formData.append("file", file);
        formData.append("type", "avatar");

        try {
            const res = await fetch("/api/upload", {
                method: "POST",
                body: formData,
            });
            const data = await res.json();

            if (data.success || data.url) {
                const newUrl = data.url || data.filePath;
                setImage(newUrl);
                if (data.fileId) setImageFileId(data.fileId);
            } else {
                setMessage({ 
                    text: tr("Расмни юклашда хатолик юз берди", "Rasmni yuklashda xatolik yuz berdi", "Ошибка при загрузке изображения", "Error uploading image"), 
                    type: "error" 
                });
            }
        } catch (err) {
            console.error("Upload error:", err);
            setMessage({ 
                text: tr("Сервер билан боғланишда хатолик", "Server bilan bog'lanishda xatolik", "Ошибка связи с сервером", "Server connection error"), 
                type: "error" 
            });
        } finally {
            setUploadingImage(false);
        }
    };

    // Сохранение всей формы: вот здесь выскакивает модалка успеха
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setMessage({ text: "", type: "" });

        try {
            const res = await fetch("/api/user/profile", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    username: name,
                    image: image,
                    imageFileId,
                    occupation,
                    instrument,
                    bio,
                    phoneNumber: phone,
                    telegram,
                }),
            });

            const data = await res.json();

            if (data.success) {
                await update({
                    user: {
                        ...session?.user,
                        name: data.user.username,
                        username: data.user.username,
                        image: image,
                    },
                });

                // Показываем модалку успеха
                setSuccessModal(true);
                
                // Держим 1.5 секунды, закрываем и обновляем данные
                setTimeout(() => {
                    setSuccessModal(false);
                    setSaving(false);
                    router.refresh();
                }, 6000);

            } else {
                setMessage({ text: data.message || data.error || "Xatolik yuz berdi", type: "error" });
                setSaving(false);
            }
        } catch (err) {
            console.error("Save error:", err);
            setMessage({ 
                text: tr("Сақлашда хатолик юз берди", "Saqlashda xatolik yuz berdi", "Ошибка при сохранении", "Error saving profile"), 
                type: "error" 
            });
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
            </div>
        );
    }

    const avatarDisplaySrc = image 
        ? `${image}${image.includes("?") ? "&" : "?"}t=${Date.now()}` 
        : "/img/avatar.webp";

    const inputClass = "w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 transition";

    const lowerOcc = occupation.toLowerCase();
    const isInstrumentalist = lowerOcc.includes("мусиқачи") || 
                              lowerOcc.includes("музыкант") || 
                              lowerOcc.includes("instrument") ||
                              lowerOcc.includes("солист");

    return (
        <div className="min-h-screen bg-neutral-950 text-white p-4 sm:p-6 md:p-12 font-sans relative">
            
            {/* Модалка успешного сохранения */}
            {successModal && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-8 max-w-md w-full text-center space-y-4 shadow-2xl">
                        <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-2xl flex items-center justify-center mx-auto">
                            <CheckCircle2 size={36} />
                        </div>
                        <h2 className="text-xl font-bold text-white">
                            {tr("Муваффақиятли янгиланди!", "Muvaffaqiyatli yangilandi!", "Успешно обновлено!", "Successfully updated!")}
                        </h2>
                        <p className="text-neutral-400 text-sm">
                            {tr("Сабр қилинг. Янгиланмоқда...", "Sabr qiling. Yangilanmoqda...", "Подождите. Обновляется...", "Please wait. Updating...")}
                        </p>
                        <div className="pt-2">
                            <div className="w-full bg-neutral-800 h-1.5 rounded-full overflow-hidden">
                                <div className="bg-emerald-500 h-full animate-[pulse_1s_infinite]"></div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="max-w-2xl mx-auto space-y-8">
                
                <div>
                    <Link
                        href="/dashboard"
                        className="group relative inline-flex items-center gap-2 px-4 py-2 rounded-xl text-neutral-400 hover:text-white text-sm bg-neutral-900 transition"
                    >
                        <span className="relative z-10 flex items-center gap-2">
                            <ArrowLeft size={16} />
                            <span>{tr("Кабинетга қайтиш", "Kabinetga qaytish", "Вернуться в кабинет", "Back to dashboard")}</span>
                        </span>
                        <div 
                            className="absolute inset-0 rounded-xl z-0 shadow-[0_0_15px_rgba(57,255,20,0.15)] transition-all duration-500 group-hover:shadow-[inset_0_0_20px_rgba(0,0,0,1)] pointer-events-none"
                            style={{
                                padding: '2px',
                                background: 'linear-gradient(to right, #000000, #FFDA09, #39FF14, #FFDA09, #000000)',
                                WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                                WebkitMaskComposite: 'xor',
                                maskComposite: 'exclude',
                            }}
                        />
                    </Link>
                </div>

                <div>
                    <h1 className="text-xl sm:text-2xl text-emerald-400 font-medium">
                        {tr("Профил созламалари", "Profil sozlamalari", "Настройки профиля", "Profile settings")}
                    </h1>
                    <p className="text-sm text-neutral-400 mt-1">
                        {tr("Шахсий маълумотларингиз, ижодингиз ва аватарингизни бошқаринг", "Shaxsiy ma'lumotlaringiz, ijodingiz va avaturingizni boshqaring", "Управляйте личными данными, творчеством и аватаром", "Manage your personal info, art and avatar")}
                    </p>
                </div>

                {message.text && (
                    <div className={`p-4 rounded-xl text-sm ${message.type === "success" ? "bg-emerald-950/50 border border-emerald-800 text-emerald-300" : "bg-red-950/50 border border-red-800 text-red-300"}`}>
                        {message.text}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 space-y-6">
                    
                    {/* Аватар */}
                    <div className="flex flex-col sm:flex-row items-center gap-6 pb-6 border-b border-neutral-800">
                        <div className="relative w-24 h-24 rounded-full overflow-hidden border-2 border-neutral-700 bg-neutral-950 shrink-0">
                            <img
                                src={avatarDisplaySrc}
                                alt="Avatar"
                                className="w-full h-full object-cover"
                            />
                            {uploadingImage && (
                                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                    <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
                                </div>
                            )}
                        </div>
                        <div className="space-y-2 text-center sm:text-left flex-1">
                            <h2 className="text-sm font-medium text-white">
                                {tr("Фойдаланувчи аватари", "Foydalanuvchi avatari", "Аватар пользователя", "User avatar")}
                            </h2>
                            <p className="text-xs text-neutral-400">
                                {tr("JPG, PNG ёки WEBP форматидаги расм юкланг.", "JPG, PNG yoki WEBP formatidagi rasm yuklang.", "Загрузите изображение в формате JPG, PNG или WEBP.", "Upload an image in JPG, PNG, or WEBP format.")}
                            </p>
                            
                            <label className={`group relative inline-flex items-center gap-2 bg-neutral-950 text-white text-xs font-semibold px-4 py-2.5 rounded-xl transition cursor-pointer ${uploadingImage ? 'opacity-40 pointer-events-none' : ''}`}>
                                <span className="relative z-10 flex items-center gap-2">
                                    <Upload size={14} className="text-emerald-400" />
                                    <span>{tr("Янги расм юклаш", "Yangi rasm yuklash", "Загрузить новое фото", "Upload new photo")}</span>
                                </span>
                                <div 
                                    className="absolute inset-0 rounded-xl z-0 shadow-[0_0_15px_rgba(57,255,20,0.2)] transition-all duration-500 group-hover:shadow-[inset_0_0_20px_rgba(0,0,0,1)] pointer-events-none"
                                    style={{
                                        padding: '2px',
                                        background: 'linear-gradient(to right, #000000, #FFDA09, #39FF14, #FFDA09, #000000)',
                                        WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                                        WebkitMaskComposite: 'xor',
                                        maskComposite: 'exclude',
                                    }}
                                />
                                <input
                                    type="file"
                                    accept="image/*"
                                    disabled={uploadingImage}
                                    onChange={handleImageUpload}
                                    className="hidden"
                                />
                            </label>
                        </div>
                    </div>

                    {/* Имя */}
                    <div className="space-y-2">
                        <label className="text-xs text-neutral-400 uppercase tracking-wider font-semibold">
                            {tr("Фойдаланувчи Исми", "Foydalanuvchi Ismi", "Имя пользователя", "Username")}
                        </label>
                        <div className="relative">
                            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-500">
                                <UserIcon size={16} />
                            </span>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 transition"
                                placeholder="Username"
                            />
                        </div>
                    </div>

                    {/* Профессия / Роль */}
                    <div className="space-y-2">
                        <label className="text-xs text-neutral-400 uppercase tracking-wider font-semibold flex items-center gap-1.5">
                            <Briefcase size={14} className="text-[#FFDA09]" />
                            {tr("Касбингиз / Ролингиз", "Kasbingiz / Rolingiz", "Ваша профессия / Роль", "Your occupation / Role")}
                        </label>
                        <input
                            type="text"
                            value={occupation}
                            onChange={(e) => setOccupation(e.target.value)}
                            className={inputClass}
                            placeholder={tr("Масалан: Хонанда, Аранжировщик, Композитор...", "Masalan: Xonanda, Aranjirovkachi, Kompozitor...", "Например: Певец, Аранжировщик, Композитор...", "e.g., Singer, Arranger, Composer...")}
                        />
                    </div>

                    {/* Поле Инструмент */}
                    {isInstrumentalist && (
                        <div className="space-y-2 animate-fadeIn">
                            <label className="text-xs text-neutral-400 uppercase tracking-wider font-semibold flex items-center gap-1.5">
                                <Music size={14} className="text-emerald-400" />
                                {tr("Ижро этадиган Мусиқа асбобингиз", "Ijro e'tadigan Musiqa asbobingiz", "Музыкальный инструмент", "Music Instrument")}
                            </label>
                            <input
                                type="text"
                                value={instrument}
                                onChange={(e) => setInstrument(e.target.value)}
                                className={inputClass}
                                placeholder={tr("Масалан: Саксофон, Бас гитара, Пианино...", "Masalan: Saksofon, Bas gitara, Pianino...", "Например: Саксофон, Бас-гитара, Пианино...", "e.g., Saxophone, Bass guitar, Piano...")}
                            />
                        </div>
                    )}

                    {/* О себе / Биография */}
                    <div className="space-y-2">
                        <label className="text-xs text-neutral-400 uppercase tracking-wider font-semibold flex items-center gap-1.5">
                            <FileText size={14} className="text-[#FFDA09]" />
                            {tr("Ўзингиз ва маҳоратингиз ҳақида", "O'zingiz va mahoratingiz haqida", "О себе и своем таланте (Биография)", "About your talent & bio")}
                        </label>
                        <textarea
                            rows={4}
                            value={bio}
                            onChange={(e) => setBio(e.target.value)}
                            className={`${inputClass} resize-y min-h-[100px]`}
                            placeholder={tr("Тажрибангиз, ижро жанрларингиз ва ҳамкорлик шартларингиз...", "Tajribangiz, ijro janrlaringiz va hamkorlik shartlaringiz...", "Ваш опыт, жанры исполнения и условия сотрудничества...", "Your experience, genres and collaboration terms...")}
                        />
                    </div>

                    {/* Контакты: Телефон и Telegram */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-xs text-neutral-400 uppercase tracking-wider font-semibold flex items-center gap-1.5">
                                <Phone size={14} className="text-emerald-400" />
                                {tr("Телефон рақамингиз", "Telefon raqamingiz", "Номер телефона", "Phone Number")}
                            </label>
                            <input
                                type="tel"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                className={inputClass}
                                placeholder="+998 90 123 45 67"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs text-neutral-400 uppercase tracking-wider font-semibold flex items-center gap-1.5">
                                <Send size={14} className="text-cyan-400" />
                                Telegram
                            </label>
                            <input
                                type="text"
                                value={telegram}
                                onChange={(e) => setTelegram(e.target.value)}
                                className={inputClass}
                                placeholder="@username"
                            />
                        </div>
                    </div>

                    {/* Email (только чтение) */}
                    <div className="space-y-2">
                        <label className="text-xs text-neutral-400 uppercase tracking-wider font-semibold">
                            Email (Электрон почта)
                        </label>
                        <input
                            type="email"
                            value={email}
                            disabled
                            className="w-full bg-neutral-950/50 border border-neutral-800/60 rounded-xl px-4 py-2.5 text-sm text-neutral-300 cursor-not-allowed"
                        />
                    </div>

                    {/* Кнопка сохранения */}
                    <div className="pt-4 flex justify-end">
                        <button
                            type="submit"
                            disabled={saving}
                            className="group relative inline-flex items-center justify-center gap-2 bg-neutral-950 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition duration-200 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer w-full sm:w-auto"
                        >
                            <span className="relative z-10 flex items-center gap-2">
                                {saving ? <Loader2 className="w-4 h-4 animate-spin text-emerald-400" /> : <Save size={16} className="text-emerald-400" />}
                                <span>{tr("Ўзгаришларни сақлаш", "O'zgarishlarni saqlash", "Сохранить изменения", "Save changes")}</span>
                            </span>
                            <div 
                                className="absolute inset-0 rounded-xl z-0 shadow-[0_0_15px_rgba(57,255,20,0.2)] transition-all duration-500 group-hover:shadow-[inset_0_0_20px_rgba(0,0,0,1)] pointer-events-none"
                                style={{
                                    padding: '2px',
                                    background: 'linear-gradient(to right, #000000, #FFDA09, #39FF14, #FFDA09, #000000)',
                                    WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                                    WebkitMaskComposite: 'xor',
                                    maskComposite: 'exclude',
                                }}
                            />
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}