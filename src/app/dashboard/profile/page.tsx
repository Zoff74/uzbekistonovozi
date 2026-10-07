// src/app/dashboard/profile/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Save, User as UserIcon, Upload } from "lucide-react";
import { tr } from "@/utils/translate";
import { useSession } from "next-auth/react";

export default function ProfileSettingsPage() {
    const router = useRouter();
    const { data: session, update } = useSession(); // 1. Достаем session для отслеживания смены пользователя
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploadingImage, setUploadingImage] = useState(false);

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [image, setImage] = useState("/img/avatar.webp");
    const [imageFileId, setImageFileId] = useState("");
    const [message, setMessage] = useState({ text: "", type: "" });

    // Уникальный идентификатор юзера из сессии для перезагрузки при смене аккаунта
    const userId = session?.user?.id || (session?.user as any)?.email;

    // Загружаем данные пользователя при открытии страницы или смене юзера
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

    // Обработчик загрузки файла аватара
    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadingImage(true);
        setMessage({ text: "", type: "" });

        const formData = new FormData();
        formData.append("file", file);

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

    // Сохранение изменений
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setMessage({ text: "", type: "" });

        try {
            const res = await fetch("/api/user/profile", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name,
                    avatarUrl: image,
                    avatarFileId: imageFileId,
                }),
            });

            const data = await res.json();

            if (data.success) {
                // 2. ВАЖНО: Вызываем update для NextAuth, чтобы сессия мгновенно обновилась в шапке
                await update({
                    user: {
                        ...session?.user,
                        name: data.user.username,
                        username: data.user.username,
                        image: image,
                    },
                });

                setMessage({ 
                    text: tr("Профил муваффақиятли янгиланди! Сабр қилинг...", "Profil muvaffaqiyatli yangilandi! Sabr qiling...", "Профиль успешно обновлен! Подождите немного...", "Profile updated successfully!"), 
                    type: "success" 
                });
                router.refresh();
                
                setTimeout(() => {
                    window.location.href = window.location.pathname + "?updated=" + Date.now();
                }, 800);
            } else {
                setMessage({ text: data.message || "Xatolik yuz berdi", type: "error" });
            }
        } catch (err) {
            console.error("Save error:", err);
            setMessage({ 
                text: tr("Сақлашда хатолик юз берди", "Saqlashda xatolik yuz berdi", "Ошибка при сохранении", "Error saving profile"), 
                type: "error" 
            });
        } finally {
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

    return (
        <div className="min-h-screen bg-neutral-950 text-white p-4 sm:p-6 md:p-12 font-sans">
            <div className="max-w-2xl mx-auto space-y-8">
                
                {/* Назад в кабинет */}
                <div>
                    <Link
                        href="/dashboard"
                        aria-disabled={false}
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

                {/* Заголовок */}
                <div>
                    <h1 className="text-xl sm:text-2xl text-emerald-400 font-medium">
                        {tr("Профил созламалари", "Profil sozlamalari", "Настройки профиля", "Profile settings")}
                    </h1>
                    <p className="text-sm text-neutral-400 mt-1">
                        {tr("Шахсий маълумотларингиз ва аватарни бошқаринг", "Shaxsiy ma'lumotlaringiz va avatarni boshqaring", "Управляйте личными данными и аватаркой", "Manage your personal info and avatar")}
                    </p>
                </div>

                {/* Сообщение статуса */}
                {message.text && (
                    <div className={`p-4 rounded-xl text-sm ${message.type === "success" ? "bg-emerald-950/50 border border-emerald-800 text-emerald-300" : "bg-red-950/50 border border-red-800 text-red-300"}`}>
                        {message.text}
                    </div>
                )}

                {/* Форма настроек */}
                <form onSubmit={handleSubmit} className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 space-y-6">
                    
                    {/* Секция аватара */}
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
                            
                            {/* Кнопка выбора аватара */}
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

                    {/* Поле Имя (Username) */}
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
                                required
                            />
                        </div>
                    </div>

                    {/* Поле Email (Только для чтения) */}
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
                        <p className="text-xs text-neutral-300">
                            {tr("Электрон почтани ўзгартириб бўлмайди. Ўзгартириш учун Янги Профиль очиш керак", "Elektron pochtani o'zgartirib bo'lmaydi. O'zgartirish uchun Yangi Profil ochish kerak ", "Электронную почту нельзя изменить.", "Email cannot be changed.")}
                        </p>
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