"use client";
// src\components\Header.tsx
import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { LogIn, ChevronDown, User, LogOut, Music, Sparkles } from "lucide-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { tr } from "@/utils/translate";
import { useSession, signOut } from "next-auth/react";

export default function Header() {
  const { data: session } = useSession();

  // Состояния для выпадающих меню (Вокал, Ижодкорлар и Меню пользователя)
  const [isVokalOpen, setIsVokalOpen] = useState(false);
  const [isIjodkorOpen, setIsIjodkorOpen] = useState(false);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  
  // Отдельные рефы для десктопной и мобильной версий аватара
  const desktopAvatarMenuRef = useRef<HTMLDivElement>(null);
  const mobileAvatarMenuRef = useRef<HTMLDivElement>(null);
  
  // Рефы для отслеживания кликов вне десктопных меню
  const desktopVokalRef = useRef<HTMLDivElement>(null);
  const desktopIjodkorRef = useRef<HTMLDivElement>(null);

  // Закрытие выпадающих меню при клике вне их областей
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (desktopVokalRef.current && !desktopVokalRef.current.contains(event.target as Node)) {
        setIsVokalOpen(false);
      }
      if (desktopIjodkorRef.current && !desktopIjodkorRef.current.contains(event.target as Node)) {
        setIsIjodkorOpen(false);
      }
      if (
        desktopAvatarMenuRef.current && 
        !desktopAvatarMenuRef.current.contains(event.target as Node) &&
        mobileAvatarMenuRef.current && 
        !mobileAvatarMenuRef.current.contains(event.target as Node)
      ) {
        setAvatarMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Функция для проверки авторизации: неавторизованных отправляем на регистрацию
  const getHref = (path: string) => {
    return session?.user ? path : "/auth/register";
  };

  // Безопасное получение URL аватара с защитой от кэширования
  const getAvatarUrl = () => {
    const rawImage = session?.user?.image;
    if (!rawImage) return "/img/avatar.webp";
    return rawImage.includes("?") ? rawImage : `${rawImage}?t=${Date.now()}`;
  };

  return (
    <>
      {/* Шапка увеличенной высоты (py-6) для десктопа и планшетов */}
      <header className="border-b border-white/5 bg-[#030712]/90 backdrop-blur-xl z-50 py-6 flex items-center w-full flex-shrink-0">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 w-full flex items-center justify-between">
          <div className="flex items-center space-x-3 sm:space-x-3">
            <Link href="/" className="relative group cursor-pointer flex-shrink-0">
              <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-2xl blur opacity-50"></div>
              <div className="relative w-14 h-14 sm:w-13 sm:h-13 rounded-2xl bg-slate-900 flex items-center justify-center border border-emerald-500/30 overflow-hidden shadow-lg">
                <img 
                  src="/img/microfonyarkiy.avif" 
                  alt="Ўзбекистон овози" 
                  className="w-10 h-10 sm:w-10 sm:h-10 object-contain"
                />
              </div>
            </Link>
            
            <div className="min-w-0 flex flex-col justify-center">
              <Link href="/" className="font-black tracking-wide bg-gradient-to-r from-white via-slate-200 to-emerald-400 bg-clip-text text-transparent flex flex-col text-sm sm:text-base leading-snug py-0.5">
                <span style={{ fontFamily: "'Bad Script', cursive, sans-serif" }} className="whitespace-nowrap overflow-visible">
                  {tr(
                    <>« <span style={{ fontSize: 32, fontFamily: "system-ui, sans-serif", fontWeight: 400, fontStyle: "normal" }}>Ў</span>ЗБЕКИСТОН ОВОЗИ »</> as any,
                    "«O'ZBEKISTON OVOZI»",
                    "«УЗБЕКИСТОН ОВОЗИ»",
                    "«UZBEKISTON OVOZI»"
                  )}
                </span>
                <span className="font-bold opacity-90 text-xs sm:text-xs leading-normal mt-0.5">
                  {tr("Машҳурликка Биринчи Қадам", "Mashhurlikka Birinchi Qadam", "Первый шаг к известности", "First Step to Fame")}
                </span>
              </Link>

              <span className="text-[11px] sm:text-[10px] tracking-widest text-emerald-400 font-bold uppercase block mt-0.5">
                New Sound System
              </span>

              <span className="font-bold opacity-90 text-xs sm:text-xs leading-normal mt-0.5">
                  {tr("Ўзбекистон хонанда ва мусиқачилари \nучун ҳамкорлик платформаси", "O'zbekiston honanda va musiqachilari uchun \nhamkorlik platformasi", "Профессиональная платформа \nколлабораций для музыкантов Узбекистана", "Professional labor and collaboration \nexchange for musicians of Uzbekistan")}
                </span>

            </div>
          </div>
          
          {/* ШАПКА НАВИГАЦИИ для ДЕСКТОПА */}
          <nav className="hidden xl:flex items-center space-x-3 text-xs font-semibold">
            <Link href="/" className="text-slate-300 hover:text-[#39FF14] transition py-2">{tr("Бош саҳифа", "Bosh sahifa", "Главная", "Home")}</Link>

            <Link href={getHref("/catalogMusiqachilar")} className="text-slate-300 hover:text-[#39FF14] transition py-2">
              {tr("Мусиқачилар", "Musiqachilar", "Музыканты", "Musicians")}
            </Link>

            {/* Раскрывающийся список для Творцев / Ижодкорлар (Десктоп) */}
            <div 
              ref={desktopIjodkorRef}
              className="relative"
              onMouseEnter={() => setIsIjodkorOpen(true)}
              onMouseLeave={() => setIsIjodkorOpen(false)}
            >
              <button 
                onClick={() => setIsIjodkorOpen((prev) => !prev)}
                className="text-slate-300 hover:text-[#39FF14] transition flex items-center gap-1 py-2 focus:outline-none cursor-pointer"
              >
                {tr("Ижодкорлар", "Ijodkorlar", "Творцы", "Creators")}
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isIjodkorOpen ? "rotate-180 text-[#39FF14]" : ""}`} />
              </button>

              {isIjodkorOpen && (
                <div className="absolute top-full left-0 w-52 bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl py-2 z-50 flex flex-col space-y-1 animate-in fade-in slide-in-from-top-2 duration-150">
                  <Link 
                    href={getHref("/catalogIjodkorlar?category=poets")} 
                    onClick={() => setIsIjodkorOpen(false)}
                    className="px-4 py-2 text-slate-300 hover:text-[#39FF14] hover:bg-white/5 transition"
                  >
                    {tr("Матн муаллифлари", "Matn mualliflari", "Авторы текстов", "Lyricists")}
                  </Link>
                  <Link 
                    href={getHref("/catalogIjodkorlar?category=composers")} 
                    onClick={() => setIsIjodkorOpen(false)}
                    className="px-4 py-2 text-slate-300 hover:text-[#39FF14] hover:bg-white/5 transition"
                  >
                    {tr("Композиторлар", "Kompozitorlar", "Композиторы", "Composers")}
                  </Link>
                </div>
              )}
            </div>
            
            {/* Раскрывающийся список для Вокала (Десктоп) */}
            <div 
              ref={desktopVokalRef}
              className="relative"
              onMouseEnter={() => setIsVokalOpen(true)}
              onMouseLeave={() => setIsVokalOpen(false)}
            >
              <button 
                onClick={() => setIsVokalOpen((prev) => !prev)}
                className="text-slate-300 hover:text-[#39FF14] transition flex items-center gap-1 py-2 focus:outline-none cursor-pointer"
              >
                {tr("Тоза Вокал", "Toza Vokal", "Чистый Вокал", "Vocals")}
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isVokalOpen ? "rotate-180 text-[#39FF14]" : ""}`} />
              </button>

              {isVokalOpen && (
                <div className="absolute top-full left-0 w-48 bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl py-2 z-50 flex flex-col space-y-1 animate-in fade-in slide-in-from-top-2 duration-150">
                  <Link 
                    href={getHref("/catalogVokal?category=akapella")} 
                    onClick={() => setIsVokalOpen(false)}
                    className="px-4 py-2 text-slate-300 hover:text-[#39FF14] hover:bg-white/5 transition"
                  >
                    {tr("Акапелла", "Akapella", "Акапелла", "Akapella")}
                  </Link>
                  <Link 
                    href={getHref("/catalogVokal?category=opera")} 
                    onClick={() => setIsVokalOpen(false)}
                    className="px-4 py-2 text-slate-300 hover:text-[#39FF14] hover:bg-white/5 transition"
                  >
                    {tr("Опера", "Opera", "Опера", "Opera")}
                  </Link>
                  <Link 
                    href={getHref("/catalogVokal?category=estrada")} 
                    onClick={() => setIsVokalOpen(false)}
                    className="px-4 py-2 text-slate-300 hover:text-[#39FF14] hover:bg-white/5 transition"
                  >
                    {tr("Эстрада", "Estrada", "Эстрада", "Estrada")}
                  </Link>
                </div>
              )}
            </div>

            <Link href={getHref("/catalogMusic")} className="text-slate-300 hover:text-[#39FF14] transition relative py-2 flex flex-col items-center text-center leading-normal translate-y-[10px]">
              <span>{tr("Таёр", "Tayor", "Готовая", "Listen to")}</span>
              <span>{tr("Мусиқа", "Musiqa", "Музыка", "Music")}</span>
            </Link>

            <Link href={getHref("/catalogSongs")} className="text-slate-300 hover:text-[#39FF14] transition relative py-2 flex flex-col items-center text-center leading-normal translate-y-[10px]">
              <span>{tr("Таёр", "Tayor", "Готовые", "Listen to")}</span>
              <span>{tr("Қўшиқлар", "Qo'shiqlar", "Песни", "Songs")}</span>
            </Link>

            <Link href={getHref("/catalogVideos")} className="text-slate-300 hover:text-[#39FF14] transition relative py-2 flex flex-col items-center text-center leading-normal translate-y-[10px]">
              <span>{tr("Таёр", "Tayor", "Готовые", "Views")}</span>
              <span>{tr("Клиплар", "Kliplar", "Клипы", "Clips")}</span>
            </Link>

            <Link href={getHref("/marketplace")} className="text-slate-300 hover:text-[#39FF14] transition relative py-2 flex flex-col items-center text-center leading-normal translate-y-[10px]">
              <span>{tr("Умумий", "Umumiy", "Единый", "All")}</span>
              <span>{tr("Маркетплейс", "Marketpleys", "Маркетплейс", "Marketplace")}</span>
            </Link>
          </nav>

          <div className="hidden xl:flex flex-row items-center space-x-3">
            <div className="relative w-[130px] h-[38px] group flex items-center justify-center">
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
              <div className="relative w-[calc(100%-6px)] h-[32px] z-30 flex items-center justify-center rounded-lg bg-gradient-to-r from-black via-black to-[#3a3a3a] text-[11px] font-bold uppercase tracking-wider transition-all duration-300 group-hover:scale-95 group-active:scale-90">
                <div className="absolute inset-0 w-full h-full pointer-events-none overflow-hidden rounded-md">
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#39FF14]/40 to-transparent -translate-x-full group-hover:animate-shimmer" />
                </div>
                <div className="relative z-50 w-full h-full flex items-center justify-center cursor-pointer text-[#39FF14] group-hover:text-slate-300 transition-colors">
                  <LanguageSwitcher />
                </div>
              </div>
            </div>

            {/* ДЕСКТОПНЫЙ БЛОК АВТОРИЗАЦИИ */}
            {session?.user ? (
              <div className="relative flex items-center gap-2" ref={desktopAvatarMenuRef}>
                <button 
                  onClick={() => setAvatarMenuOpen(!avatarMenuOpen)}
                  className="relative w-[38px] h-[38px] rounded-xl flex-shrink-0 transition active:scale-95 cursor-pointer flex items-center justify-center group"
                  title={tr("Профиль", "Profil", "Профиль", "Profile")}
                >
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
                  <div className="w-[32px] h-[32px] rounded-lg overflow-hidden relative z-10 bg-slate-900 flex items-center justify-center">
                    <img 
                      src={getAvatarUrl()} 
                      alt={session.user.name || "User"} 
                      className="w-full h-full object-cover"
                    />
                  </div>
                </button>

                {avatarMenuOpen && (
                  <div className="absolute right-0 mt-3 top-full w-56 bg-slate-900/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl py-2 z-50 animate-in fade-in slide-in-from-top-2">
                    <div className="px-4 py-2 border-b border-white/5">
                      <p className="text-xs font-bold text-white truncate">
                        {session.user.name || tr("Тингловчи / Ижодкор", "Tinglovchi / Ijodkor", "Пользователь / Творец", "User / Creator")}
                      </p>
                      <p className="text-[11px] text-slate-400 truncate">{session.user.email}</p>
                    </div>

                    <div className="py-1">
                      <Link 
                        href="/dashboard/profile"
                        onClick={() => setAvatarMenuOpen(false)}
                        className="w-full px-4 py-2 text-xs font-medium text-slate-300 hover:text-white hover:bg-white/5 flex items-center gap-2.5 transition"
                      >
                        <User className="w-4 h-4 text-emerald-400" /> {tr("Профильни ўзгартириш", "Profilni o'zgartirish", "Изменить профиль", "Edit Profile")}
                      </Link>
                      <Link 
                        href="/dashboard"
                        onClick={() => setAvatarMenuOpen(false)}
                        className="w-full px-4 py-2 text-xs font-bold text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 flex items-center gap-2.5 transition"
                      >
                        <Sparkles className="w-4 h-4" /> {tr("Контент яратиш ва бошқариш", "Kontent yaratish va boshqarish", "Создать и управлять контентом", "Create and manage content")}
                      </Link>
                    </div>

                    <div className="pt-1 border-t border-white/5">
                      <button
                        onClick={() => {
                          setAvatarMenuOpen(false);
                          signOut({ callbackUrl: "/" });
                        }}
                        className="w-full px-4 py-2 text-xs font-semibold text-red-400 hover:text-red-300 hover:bg-red-500/10 flex items-center gap-2.5 transition cursor-pointer text-left"
                      >
                        <LogOut className="w-4 h-4" /> {tr("Тизимдан чиқиш", "Tizimdan chiqish", "Выйти из системы", "Log Out")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="relative w-[130px] h-[38px] group flex items-center justify-center cursor-pointer">
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
                <Link 
                  href="/auth/login"
                  className="relative w-[calc(100%-6px)] h-[32px] z-10 flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-black via-black to-[#3a3a3a] text-[#39FF14] text-[11px] font-bold uppercase tracking-wider transition-all duration-300 overflow-hidden group-hover:scale-95 group-active:scale-90 group-hover:text-slate-300"
                >
                  <div className="absolute inset-0 w-full h-full pointer-events-none overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#39FF14]/40 to-transparent -translate-x-full group-hover:animate-shimmer" />
                  </div>
                  <LogIn className="w-3.5 h-3.5 text-[#39FF14] relative z-10 group-hover:text-slate-300 transition-colors" />
                  <span className="relative z-10 drop-shadow-[0_0_5px_rgba(57,255,20,0.5)]">{tr("Кириш", "Kirish", "Вход", "Login")}</span>
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Мобильная шапка: переключатель языков и аватар/вход */}
      <div className="xl:hidden flex items-center justify-between bg-black/80 border-b border-white/5 px-4 py-3 flex-shrink-0">
        <div className="relative w-[130px] h-[36px] group flex items-center justify-center">
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
          <div className="relative w-[calc(100%-6px)] h-[30px] z-30 flex items-center justify-center rounded-lg bg-gradient-to-r from-black via-black to-[#3a3a3a] text-[11px] font-bold uppercase tracking-wider transition-all duration-300 group-hover:scale-95 group-active:scale-90">
            <div className="absolute inset-0 w-full h-full pointer-events-none overflow-hidden rounded-md">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#39FF14]/40 to-transparent -translate-x-full group-hover:animate-shimmer" />
            </div>
            <div className="relative z-50 w-full h-full flex items-center justify-center cursor-pointer text-[#39FF14] group-hover:text-slate-300 transition-colors">
              <LanguageSwitcher />
            </div>
          </div>
        </div>

        {/* МОБИЛЬНЫЙ БЛОК АВТОРИЗАЦИИ */}
        {session?.user ? (
          <div className="relative flex items-center gap-2" ref={mobileAvatarMenuRef}>
            <button 
              onClick={() => setAvatarMenuOpen(!avatarMenuOpen)}
              className="relative w-[38px] h-[38px] rounded-xl flex-shrink-0 transition active:scale-95 cursor-pointer flex items-center justify-center group"
              title={tr("Профиль", "Profil", "Профиль", "Profile")}
            >
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
              <div className="w-[32px] h-[32px] rounded-lg overflow-hidden relative z-10 bg-slate-900 flex items-center justify-center">
                <img 
                  src={getAvatarUrl()} 
                  alt={session.user.name || "User"} 
                  className="w-full h-full object-cover"
                />
              </div>
            </button>

            {avatarMenuOpen && (
              <div className="absolute right-0 mt-3 top-full w-56 bg-slate-900/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl py-2 z-50 animate-in fade-in slide-in-from-top-2">
                <div className="px-4 py-2 border-b border-white/5">
                  <p className="text-xs font-bold text-white truncate">
                    {session.user.name || tr("Тингловчи / Ижодкор", "Tinglovchi / Ijodkor", "Пользователь / Творец", "User / Creator")}
                  </p>
                  <p className="text-[11px] text-slate-400 truncate">{session.user.email}</p>
                </div>

                <div className="py-1">
                  <Link 
                    href="/dashboard/profile"
                    onClick={() => setAvatarMenuOpen(false)}
                    className="w-full px-4 py-2 text-xs font-medium text-slate-300 hover:text-white hover:bg-white/5 flex items-center gap-2.5 transition"
                  >
                    <User className="w-4 h-4 text-emerald-400" /> {tr("Профильни ўзгартириш", "Profilni o'zgartirish", "Изменить профиль", "Edit Profile")}
                  </Link>
                  <Link 
                    href="/dashboard"
                    onClick={() => setAvatarMenuOpen(false)}
                    className="w-full px-4 py-2 text-xs font-bold text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 flex items-center gap-2.5 transition"
                  >
                    <Sparkles className="w-4 h-4" /> {tr("Контент яратиш ва бошқариш", "Kontent yaratish va boshqarish", "Создать и управлять контентом", "Create and manage content")}
                  </Link>
                </div>

                <div className="pt-1 border-t border-white/5">
                  <button
                    onClick={() => {
                      setAvatarMenuOpen(false);
                      signOut({ callbackUrl: "/" });
                    }}
                    className="w-full px-4 py-2 text-xs font-semibold text-red-400 hover:text-red-300 hover:bg-red-500/10 flex items-center gap-2.5 transition cursor-pointer text-left"
                  >
                    <LogOut className="w-4 h-4" /> {tr("Тизимдан чиқиш", "Tizimdan chiqish", "Выйти из системы", "Log Out")}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="relative w-[130px] h-[38px] group flex items-center justify-center cursor-pointer">
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
            <Link 
              href="/auth/login"
              className="relative w-[calc(100%-6px)] h-[32px] z-10 flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-black via-black to-[#3a3a3a] text-[#39FF14] text-[11px] font-bold uppercase tracking-wider transition-all duration-300 overflow-hidden group-hover:scale-95 group-active:scale-90 group-hover:text-slate-300"
            >
              <div className="absolute inset-0 w-full h-full pointer-events-none overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#39FF14]/40 to-transparent -translate-x-full group-hover:animate-shimmer" />
              </div>
              <LogIn className="w-3.5 h-3.5 text-[#39FF14] relative z-10 group-hover:text-slate-300 transition-colors" />
              <span className="relative z-10 drop-shadow-[0_0_5px_rgba(57,255,20,0.5)]">{tr("Кириш", "Kirish", "Вход", "Login")}</span>
            </Link>
          </div>
        )}
      </div>
    </>
  );
}