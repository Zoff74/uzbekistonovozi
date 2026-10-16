"use client";
// src/app/marketplace/new/page.tsx
import React, { useState, useRef, ChangeEvent, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Store, Camera, X, Loader2 } from "lucide-react";
import { compressImage } from "@/utils/image-compressor";
import { tr } from "@/utils/translate";

export default function NewMarketplaceItemPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("сўм");
  
  const [section, setSection] = useState("Мусиқа асбоблари ва Аппаратура");
  const [customTag, setCustomTag] = useState("");

  // Город / Регион объявления
  const [city, setCity] = useState("Тошкент");
  const [customCity, setCustomCity] = useState("");
  const [isCustomCity, setIsCustomCity] = useState(false);

  // Стейт для загрузки файла с устройства
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [description, setDescription] = useState("");
  const [phone, setPhone] = useState("");
  const [telegram, setTelegram] = useState("");

  // Очистка памяти превью при размонтировании
  useEffect(() => {
    return () => {
      if (imagePreview) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

  const handleCitySelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === "custom") {
      setIsCustomCity(true);
      setCity(customCity);
    } else {
      setIsCustomCity(false);
      setCity(val);
    }
  };

  const handleImageChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        let processedFile: File = file;
        // Если файл больше 1MB, сжимаем его
        if (file.size > 1024 * 1024) {
          processedFile = await compressImage(file);
        }
        setImageFile(processedFile);

        if (imagePreview) {
          URL.revokeObjectURL(imagePreview);
        }
        const previewUrl = URL.createObjectURL(processedFile);
        setImagePreview(previewUrl);
      } catch (err) {
        console.error("Ошибка обработки изображения:", err);
        setError(tr("Расмни юклашда хатолик юз берди.", "Rasmni yuklashda xatolik yuz berdi.", "Ошибка при загрузке изображения.", "Error loading image."));
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    setLoading(true);
    setError("");

    // Если выбрано "Бошқа товар ва хизматлар", добавляем кастомный тег, иначе используем только секцию
    const finalCategory = (section === "Бошқа товар ва хизматлар" && customTag.trim())
      ? `Бошқа: ${customTag.trim()}`
      : section;

    const finalCity = isCustomCity ? customCity.trim() : city;

    if (!finalCity) {
      setError(tr("Илтимос, шаҳарни кўрсатинг.", "Iltimos, shaharni ko'rsating.", "Пожалуйста, укажите город.", "Please specify a city."));
      setLoading(false);
      return;
    }

    if (!imageFile && !imagePreview) {
      setError(tr("Илтимос, товар ёки хизмат расмини юкланг.", "Iltimos, tovar yoki xizmat rasmini yuklang.", "Пожалуйста, загрузите фото товара или услуги.", "Please upload an image."));
      setLoading(false);
      return;
    }

    try {
      const formData = new FormData();
      formData.append("title", title);
      formData.append("price", price);
      formData.append("currency", currency);
      formData.append("category", finalCategory);
      formData.append("city", finalCity);
      formData.append("description", description);
      formData.append("phone", phone);
      formData.append("telegram", telegram);
      
      if (imageFile) {
        formData.append("image", imageFile);
      }

      const res = await fetch("/api/marketplace", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (data.success) {
        router.push("/marketplace");
      } else {
        setError(data.error || "Хатолик юз берди");
        setLoading(false);
      }
    } catch (err) {
      console.error("Marketplace post error:", err);
      setError("Сервер билан боғланишда хатолик.");
      setLoading(false);
    }
  };

  const inputClass = "p-3.5 border-2 border-[#39FF14]/50 focus:border-[#39FF14] rounded-xl w-full bg-black text-white font-medium focus:outline-none transition-colors duration-300";

  return (
    <div className="min-h-screen bg-[#030712] text-white p-4 sm:p-8 pt-12 font-sans">
      <div className="max-w-2xl mx-auto space-y-6">
        
        <Link href="/marketplace" className="inline-flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-[#39FF14] transition">
          <ArrowLeft className="w-4 h-4" />
          {tr("Маркетплейсга қайтиш", "Marketpleysga qaytish", "Назад в маркетплейс", "Back to marketplace")}
        </Link>

        <div className="bg-black border-2 border-[#39FF14]/40 rounded-3xl p-6 sm:p-8 shadow-[0_0_25px_rgba(57,255,20,0.15)] space-y-6">
          <div className="flex items-center gap-3 border-b border-neutral-800 pb-4">
            <Store className="w-7 h-7 text-[#39FF14]" />
            <h1 className="text-xl sm:text-2xl font-black text-[#FFDA09]">
              {tr("Эълон бериш (Товар ёки Хизмат)", "E'lon berish (Tovar yoki Xizmat)", "Разместить объявление (Товар или Услуга)", "Post an Ad (Item or Service)")}
            </h1>
          </div>

          {error && (
            <div className="p-3 bg-red-950/50 border border-red-500/50 rounded-xl text-red-400 text-xs text-center font-semibold">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
            
            {/* Название объявления */}
            <div className="space-y-1.5">
              <label className="text-xs text-[#FFDA09] uppercase font-bold tracking-wider">
                {tr("Эълон номи", "E'lon nomi", "Название (Услуги или Товара)", "Title")}
              </label>
              <input
                type="text"
                required
                placeholder="Масалан: Yamaha гитара, Rolex соат, Плотник хизмати"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={loading}
                className={inputClass}
              />
            </div>

            {/* Выбор общего раздела */}
            <div className="space-y-1.5">
              <label className="text-xs text-[#FFDA09] uppercase font-bold tracking-wider">
                {tr("Категориялар", "Kategoriyalar", "Категории", "Main Section")}
              </label>
              <select
                value={section}
                onChange={(e) => setSection(e.target.value)}
                disabled={loading}
                className={inputClass}
              >
                <option value="Мусиқа асбоблари ва Аппаратура">🎸 Мусиқа асбоблари ва Аппаратура (Товар)</option>
                <option value="Саҳна либослари ва Стиль">✨ Саҳна либослари, соатлар ва б. (Товар)</option>
                <option value="Артистлар учун хизматлар">🎯 Артистлар учун хизматлар (Визаж, Стоматолог...)</option>
                <option value="Шоу-бизнес ва Логистика">🚗 Шоу-транспорт, ижара, лимузин (Хизмат)</option>
                <option value="Бошқа товар ва хизматлар">📦 Бошқа товар ва хизматлар (Ўз вариантингиз)</option>
              </select>
            </div>

            {/* СКАНИРУЕМОЕ ПОЛЕ: Появляется ТОЛЬКО если выбрано "Бошқа товар ва хизматлар" */}
            {section === "Бошқа товар ва хизматлар" && (
              <div className="space-y-1.5 animate-fadeIn">
                <label className="text-xs text-[#39FF14] uppercase font-bold tracking-wider flex items-center gap-1">
                  ✨ {tr("Ўз тоифангизни киритинг", "O'z toifangizni kiriting", "Введите свою категорию / направление", "Enter custom category")}
                </label>
                <input
                  type="text"
                  required
                  placeholder="Масалан: Стоматология, Массаж, Реклама реквизити..."
                  value={customTag}
                  onChange={(e) => setCustomTag(e.target.value)}
                  disabled={loading}
                  className={inputClass}
                />
              </div>
            )}

            {/* ВЫБОР ГОРОДА */}
            <div className="space-y-1.5">
              <label className="text-xs text-[#FFDA09] uppercase font-bold tracking-wider">
                {tr("Шаҳар / Вилоят", "Shahar / Viloyat", "Город / Регион", "City / Region")}
              </label>
              
              {!isCustomCity ? (
                <select
                  value={city}
                  onChange={handleCitySelectChange}
                  disabled={loading}
                  className={inputClass}
                >
                  <option value="Тошкент">🏙️ Тошкент</option>
                  <option value="Самарқанд">🏛️ Самарқанд</option>
                  <option value="Бухоро">🕌 Бухоро</option>
                  <option value="Фарғона"> vallée Фарғона</option>
                  <option value="Андижон">🌿 Андижон</option>
                  <option value="Наманган">🌸 Наманган</option>
                  <option value="Қашқадарё (Қарши)">☀️ Қашқадарё (Қарши)</option>
                  <option value="Сурхондарё (Термиз)">🦁 Сурхондарё (Термиз)</option>
                  <option value="Жиззах">⛰️ Жиззах</option>
                  <option value="Сирдарё (Гулистон)">🌾 Сирдарё (Гулистон)</option>
                  <option value="Навоий">🏭 Навоий</option>
                  <option value="Хоразм (Урганч)">🏺 Хоразм (Урганч)</option>
                  <option value="Қорақалпоғистон (Нукус)">🌊 Қорақалпоғистон (Нукус)</option>
                  <option value="custom">✍️ Бошқа шаҳар (ўз вариантингиз)...</option>
                </select>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    placeholder="Шаҳар номини киритинг..."
                    value={customCity}
                    onChange={(e) => {
                      setCustomCity(e.target.value);
                      setCity(e.target.value);
                    }}
                    disabled={loading}
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomCity(false);
                      setCity("Тошкент");
                    }}
                    className="px-4 bg-neutral-900 border border-[#39FF14]/50 rounded-xl text-xs text-[#39FF14] hover:bg-neutral-800 transition shrink-0"
                  >
                    {tr("Орқага", "Orqaga", "Назад", "Back")}
                  </button>
                </div>
              )}
            </div>

            {/* ЗАГРУЗКА ФОТО С УСТРОЙСТВА */}
            <div className="space-y-1.5">
              <label className="text-xs text-[#FFDA09] uppercase font-bold tracking-wider">
                {tr("Товар сурати (Компютер ёки телефондан юклаш)", "Tovar surati", "Фото (Загрузить с устройства)", "Upload Photo")}
              </label>
              
              <div 
                onClick={() => !loading && fileInputRef.current?.click()} 
                className={`p-4 border-2 border-dashed border-[#39FF14]/50 hover:border-[#39FF14] rounded-xl w-full bg-black text-white font-medium transition-all duration-300 flex items-center justify-between cursor-pointer ${loading ? "opacity-70 cursor-not-allowed pointer-events-none" : ""}`}
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  {imagePreview ? (
                    <div className="relative w-12 h-12 rounded-lg overflow-hidden shrink-0 border border-[#39FF14]">
                      <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <Camera className="w-6 h-6 text-[#39FF14] shrink-0" />
                  )}
                  <span className="text-sm truncate text-gray-300">
                    {imageFile ? imageFile.name : tr(
                      "Босиб фото суратни танланг...",
                      "Bosib foto suratni tanlang...",
                      "Нажмите, чтобы выбрать фото с устройства...",
                      "Click to choose a photo..."
                    )}
                  </span>
                </div>

                {imagePreview && !loading && (
                  <button 
                    type="button" 
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      setImageFile(null); 
                      setImagePreview(null); 
                    }} 
                    className="text-red-500 hover:text-red-400 p-1.5 shrink-0"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleImageChange} 
                accept="image/*" 
                className="hidden" 
                disabled={loading} 
              />
            </div>

            {/* Цена и валюта */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs text-[#FFDA09] uppercase font-bold tracking-wider">
                  {tr("Нархи", "Narxi", "Цена", "Price")}
                </label>
                <input
                  type="number"
                  required
                  placeholder="150 000"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  disabled={loading}
                  className={inputClass}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-[#FFDA09] uppercase font-bold tracking-wider">
                  {tr("Валюта", "Valyuta", "Валюта", "Currency")}
                </label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  disabled={loading}
                  className={inputClass}
                >
                  <option value="сўм">сўм (UZS)</option>
                  <option value="$">$ (USD)</option>
                </select>
              </div>
            </div>

            {/* Описание */}
            <div className="space-y-1.5">
              <label className="text-xs text-[#FFDA09] uppercase font-bold tracking-wider">
                {tr("Батафсил тавсиф", "Batafsil tavsif", "Подробное описание", "Description")}
              </label>
              <textarea
                rows={3}
                placeholder="Масалан: Товар ёки хизмат ҳақида батафсил маълумот..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={loading}
                className={inputClass}
              />
            </div>

            {/* Контакты */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="space-y-1.5">
                <label className="text-xs text-[#FFDA09] uppercase font-bold tracking-wider">
                  {tr("Телефон", "Telefon", "Телефон", "Phone")}
                </label>
                <input
                  type="text"
                  placeholder="+998 90 123 45 67"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={loading}
                  className={inputClass}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-[#FFDA09] uppercase font-bold tracking-wider">
                  {tr("Telegram", "Telegram", "Telegram username", "Telegram")}
                </label>
                <input
                  type="text"
                  placeholder="@username"
                  value={telegram}
                  onChange={(e) => setTelegram(e.target.value)}
                  disabled={loading}
                  className={inputClass}
                />
              </div>
            </div>

            {/* Кнопка отправки */}
            <button
              type="submit"
              disabled={loading}
              className="w-full mt-6 py-4 bg-[#39FF14] hover:bg-[#32e010] text-black font-black uppercase tracking-widest rounded-xl transition shadow-[0_0_20px_rgba(57,255,20,0.4)] disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-5 h-5 animate-spin" />}
              {loading ? tr("Жойлаштирилмоқда...", "Joylashtirilmoqda...", "Публикация...", "Posting...") : tr("Эълонни жойлаштириш", "E'lonni joylashtirish", "Опубликовать объявление", "Publish Ad")}
            </button>

          </form>
        </div>

      </div>
    </div>
  );
}