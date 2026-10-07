"use client";

// БЛОК - "LanguageSwitcher" src\components\LanguageSwitcher.tsx
import { useState, useEffect, useRef } from "react";
import { tr } from "@/utils/translate";
import { Globe, Check, ChevronDown } from "lucide-react";

export type Language = "uz-Cyrl" | "uz-Latn" | "ru" | "en";

interface LangOption {
  code: Language;
  label: string;
  flag: string;
}

const languages: LangOption[] = [
  { code: "uz-Cyrl", label: "Ўзбекча", flag: "🇺🇿" },
  { code: "uz-Latn", label: "O'zbekcha", flag: "🇺🇿" },
  { code: "ru", label: "Русский", flag: "🇷🇺" },
  { code: "en", label: "English", flag: "🇬🇧" },
];

export default function LanguageSwitcher() {
  const [currentLang, setCurrentLang] = useState<Language>("uz-Cyrl");
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const savedLang = localStorage.getItem("app_lang") as Language;
    if (savedLang) {
      setCurrentLang(savedLang);
    }
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const changeLanguage = (lang: Language) => {
    setCurrentLang(lang);
    localStorage.setItem("app_lang", lang);
    setIsOpen(false);
    window.location.reload();
  };

  const selectedOption = languages.find((l) => l.code === currentLang) || languages[0];

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-[#39FF14] hover:text-white transition cursor-pointer backdrop-blur-xl group shadow-sm bg-transparent"
        title={tr("Тилни ўзгартириш / Сменить язык", "Tilni o'zgartirish / Sменить язык", "Сменить язык / Tilni o'zgartirish", "Change language")}
      >
        <Globe className="w-4 h-4 text-emerald-400 group-hover:rotate-45 transition-transform duration-300" />
        <span className="text-xs font-semibold tracking-wide">{selectedOption.label}</span>
        <ChevronDown className={`w-3.5 h-3.5 opacity-60 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 sm:left-auto sm:right-0 mt-2 w-48 bg-neutral-900/95 backdrop-blur-2xl border border-neutral-800 rounded-2xl shadow-2xl py-2 z-50 animate-in fade-in slide-in-from-top-2">
          <div className="px-3 py-1.5 border-b border-neutral-800 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
            {tr("Тилни танланг", "Tilni tanlang", "Выберите язык", "Select language")}
          </div>

          <div className="py-1">
            {languages.map((lang) => {
              const isSelected = lang.code === currentLang;
              return (
                <button
                  key={lang.code}
                  onClick={() => changeLanguage(lang.code)}
                  className={`w-full px-3 py-2 text-xs font-medium flex items-center justify-between transition cursor-pointer text-left bg-transparent border-none ${
                    isSelected
                      ? "bg-emerald-500/10 text-emerald-400 font-bold"
                      : "text-slate-300 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm">{lang.flag}</span>
                    <span>{lang.label}</span>
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}