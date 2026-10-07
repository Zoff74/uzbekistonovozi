"use client";

// БЛОК - "GenreCategories" src\components\GenreCategories.tsx
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Headphones, Disc, Flame, Zap, Award, Guitar, Music, ChevronLeft, ChevronRight } from "lucide-react";
import { tr } from "@/utils/translate";

const iconMap: Record<string, any> = {
  Music: Music,
  Disc: Disc,
  Flame: Flame,
  Zap: Zap,
  Award: Award,
  Guitar: Guitar,
  Headphones: Headphones,
};

const gradients = [
  "from-emerald-500/20 to-teal-500/5",
  "from-amber-500/20 to-orange-500/5",
  "from-purple-500/20 to-indigo-500/5",
  "from-cyan-500/20 to-blue-500/5",
  "from-blue-500/20 to-sky-500/5",
  "from-green-500/20 to-emerald-500/5",
  "from-pink-500/20 to-rose-500/5",
  "from-violet-500/20 to-purple-500/5",
];

export default function GenreCategories() {
  const [genrePage, setGenrePage] = useState(0);
  const [genresList, setGenresList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCategories() {
      try {
        const res = await fetch("/api/categories", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          console.log("Фронтенд получил категории:", data);
          setGenresList(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error("Категорияларни юклаш хатолиги:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchCategories();
  }, []);

  const itemsPerPage = 4;
  const totalGenrePages = Math.ceil(genresList.length / itemsPerPage) || 1;
  const currentGenres = genresList.slice(genrePage * itemsPerPage, (genrePage + 1) * itemsPerPage);

  const nextGenrePage = () => {
    setGenrePage((prev) => (prev < totalGenrePages - 1 ? prev + 1 : prev));
  };

  const prevGenrePage = () => {
    setGenrePage((prev) => (prev > 0 ? prev - 1 : prev));
  };

  if (loading) {
    return (
      <div className="py-6 text-center text-slate-500 text-sm">
        {tr("Категориялар юкланмоқда...", "Kategoriyalar yuklanmoqda...", "Категории загружаются...", "Loading categories...")}
      </div>
    );
  }

  if (genresList.length === 0) {
    return (
      <div className="py-6 text-center text-slate-500 text-sm">
        {tr("Категориялар топилмади", "Kategoriyalar topilmadi", "Категории не найдены", "No categories found")}
      </div>
    );
  }

  const pageIndicatorTemplate = tr("Саҳифа {current} / {total}", "Sahifa {current} / {total}", "Страница {current} / {total}", "Page {current} / {total}");
  const pageText = pageIndicatorTemplate
    .replace("{current}", String(genrePage + 1))
    .replace("{total}", String(totalGenrePages));

  return (
    <section className="space-y-4 pt-2">
      <div className="flex items-center justify-between border-b border-white/5 pb-3">
        <div className="flex items-center gap-2">
          <Headphones className="w-4 h-4 text-emerald-400" />
          <h2 className="text-base sm:text-lg font-black tracking-tight text-white">
            {tr("Жанр ва мусиқачилар категориялари", "Janr va musiqachilar kategoriyalari", "Жанры и категории музыкантов", "Genres and musician categories")}
          </h2>
        </div>
        
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400 font-medium">
            {pageText}
          </span>
          <div className="flex items-center gap-1.5">
            <button 
              onClick={prevGenrePage}
              disabled={genrePage === 0}
              className={`w-8 h-8 rounded-xl border flex items-center justify-center transition ${
                genrePage === 0 
                  ? 'bg-white/5 border-white/5 text-slate-600 cursor-not-allowed opacity-40' 
                  : 'bg-white/5 border-white/10 hover:border-emerald-500/40 text-emerald-400 cursor-pointer'
              }`}
              title={tr("Олдинги", "Oldingi", "Предыдущая", "Previous")}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button 
              onClick={nextGenrePage}
              disabled={genrePage >= totalGenrePages - 1}
              className={`w-8 h-8 rounded-xl border flex items-center justify-center transition ${
                genrePage >= totalGenrePages - 1 
                  ? 'bg-white/5 border-white/5 text-slate-600 cursor-not-allowed opacity-40' 
                  : 'bg-white/5 border-white/10 hover:border-emerald-500/40 text-emerald-400 cursor-pointer'
              }`}
              title={tr("Кейинги", "Keyingi", "Следующая", "Next")}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-in fade-in duration-300">
        {currentGenres.map((genre, index) => {
          const IconComponent = iconMap[genre.icon] || Music;
          const colorGradient = gradients[index % gradients.length];

          return (
            <Link 
              key={genre._id}
              href={`/catalog/${genre._id}`}
              className={`p-5 rounded-2xl bg-gradient-to-br ${colorGradient} border border-white/10 hover:border-emerald-500/40 transition duration-300 cursor-pointer group flex items-center justify-between shadow-lg`}
            >
              <div className="min-w-0 pr-3">
                <h4 className="font-bold text-sm text-white group-hover:text-emerald-400 transition line-clamp-2">{genre.name}</h4>
                <p className="text-xs text-slate-400 mt-1">
                  {tr("Категория", "Kategoriya", "Категория", "Category")}
                </p>
              </div>
              <div className="w-11 h-11 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition flex-shrink-0">
                <IconComponent className="w-5 h-5" />
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}