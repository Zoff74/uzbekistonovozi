"use client";
//src\app\catalogIjodkorlar\page.tsx
import React, { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, User, Sparkles } from "lucide-react";
import { tr } from "@/utils/translate";

interface Creator {
  _id: string;
  name: string;
  avatar: string;
  role: string;
}

function CatalogIjodkorlarContent() {
  const searchParams = useSearchParams();
  // Если категория не передана, по умолчанию берем поэтов (или нужную вам категорию)
  const category = searchParams.get("category") || "poets";

  const [creators, setCreators] = useState<Creator[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/singers?type=${category}`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setCreators(data);
        } else if (data.singers) {
          setCreators(data.singers);
        } else {
          setCreators([]);
        }
      })
      .catch((err) =>
        console.error(
          tr(
            "Хатолик ижодкорларни юклашда:",
            "Xatolik ijodkorlarni yuklashda:",
            "Ошибка при загрузке творцов:",
            "Error loading creators:"
          ),
          err
        )
      )
      .finally(() => setLoading(false));
  }, [category]);

  // Четкие заголовки строго под конкретные категории
  const getTitles = () => {
    switch (category) {
      case "poets":
        return {
          tag: tr("Шоирлар ва матн муаллифлари", "Shoirlar va matn mualliflari", "Поэты и авторы текстов", "Poets & Lyricists"),
          title: tr("Шоирлар каталоги", "Shoirlar katalogi", "Каталог поэтов", "Poets Catalog"),
          desc: tr("Барча шоирлар ва шеър муаллифлари.", "Barcha shoirlar va she'r mualliflari.", "Все поэты и авторы стихотворений.", "All poets and lyric authors.")
        };
      case "composers":
        return {
          tag: tr("Композиторлар", "Kompozitorlar", "Композиторы", "Composers"),
          title: tr("Композиторлар каталоги", "Kompozitorlar katalogi", "Каталог композиторов", "Composers Catalog"),
          desc: tr("Мусиқа ва аранжировка муаллифлари.", "Musiqa va aranjirovka mualliflari.", "Авторы музыки и аранжировок.", "Music and arrangement authors.")
        };
      default:
        // Если пришла какая-то другая специфичная категория
        return {
          tag: tr("Ижодкорлар", "Ijodkorlar", "Творцы", "Creators"),
          title: tr("Ижодкорлар каталоги", "Ijodkorlar katalogi", "Каталог творцов", "Creators Catalog"),
          desc: tr("Лойиҳа ижодкорлари.", "Loyiha ijodkorlari.", "Создатели проектов.", "Project creators.")
        };
    }
  };

  const currentHeader = getTitles();

  return (
    <div className="bg-[#030712] text-white min-h-screen p-4 sm:p-8 pt-24">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Кнопка назад */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-emerald-400 transition"
        >
          <ArrowLeft className="w-4 h-4" />{" "}
          {tr(
            "Бош саҳифага қайтиш",
            "Bosh sahifaga qaytish",
            "Вернуться на главную",
            "Back to home"
          )}
        </Link>

        {/* Шапка раздела */}
        <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-amber-950/40 via-slate-900 to-black border border-white/10 shadow-xl flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">
              {currentHeader.tag}
            </span>
            <h1 className="text-2xl sm:text-4xl font-black mt-1">
              {currentHeader.title}
            </h1>
            <p className="text-slate-400 text-xs sm:text-sm mt-2">
              {currentHeader.desc}
            </p>
          </div>
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 sm:flex items-center justify-center text-amber-400 hidden">
            <Sparkles className="w-8 h-8" />
          </div>
        </div>

        {/* Сетка ижодкоров */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold">
            {tr(
              "Барча ижодкорлар",
              "Barcha ijodkorlar",
              "Все творцы",
              "All creators"
            )}
          </h2>

          {loading ? (
            <div className="text-slate-500 text-sm">
              {tr("Юкланмоқда...", "Yuklanmoqda...", "Загрузка...", "Loading...")}
            </div>
          ) : creators.length === 0 ? (
            <div className="text-slate-500 text-sm">
              {tr(
                "Ижодкорлар топилмади.",
                "Ijodkorlar topilmadi.",
                "Творцы не найдены.",
                "No creators found."
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {creators.map((creator) => (
                <Link
                  key={creator._id}
                  href={`/singers/${creator._id}`}
                  className="group p-4 rounded-2xl bg-slate-900/60 border border-white/5 hover:border-amber-500/40 transition flex flex-col items-center text-center cursor-pointer"
                >
                  <div className="w-20 h-20 rounded-full overflow-hidden bg-slate-800 mb-3 border border-white/10 group-hover:border-amber-500 transition">
                    {creator.avatar ? (
                      <img
                        src={creator.avatar}
                        alt={creator.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-500">
                        <User className="w-8 h-8" />
                      </div>
                    )}
                  </div>
                  <h3 className="font-bold text-sm text-white group-hover:text-amber-400 transition truncate w-full">
                    {creator.name}
                  </h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {creator.role ||
                      tr("Ижодкор", "Ijodkor", "Творец", "Creator")}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CatalogIjodkorlarPage() {
  return (
    <Suspense fallback={<div className="bg-[#030712] text-white min-h-screen p-8 pt-24">Загрузка...</div>}>
      <CatalogIjodkorlarContent />
    </Suspense>
  );
}