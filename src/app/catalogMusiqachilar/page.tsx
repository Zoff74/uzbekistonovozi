"use client";

// src/app/catalogMusiqachilar/page.tsx
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, User, Music, Search } from "lucide-react";
import { tr } from "@/utils/translate";

interface Musician {
  _id: string;
  name: string;
  avatar: string;
  role: string;
}

export default function CatalogMusiqachilarPage() {
  const [musicians, setMusicians] = useState<Musician[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetch("/api/musiqachilar")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setMusicians(data);
        } else if (data.musicians) {
          setMusicians(data.musicians);
        }
      })
      .catch((err) =>
        console.error(
          tr(
            "Хатолик мусиқачиларни юклашда:",
            "Xatolik musiqachilarni yuklashda:",
            "Ошибка при загрузке музыкантов:",
            "Error loading musicians:"
          ),
          err
        )
      )
      .finally(() => setLoading(false));
  }, []);

  // Фильтрация музыкантов только по текстовому поиску
  const filteredMusicians = musicians.filter((musician) => {
    const matchesName = musician.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = musician.role?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesName || matchesRole;
  });

  return (
    <div className="bg-[#030712] text-white min-h-screen p-4 sm:p-8 pt-24">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Кнопка назад */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-cyan-400 transition"
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
        <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-cyan-950/40 via-slate-900 to-black border border-white/10 shadow-xl flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-cyan-400 uppercase tracking-widest">
              {tr(
                "Мусиқачилар",
                "Musiqachilar",
                "Музыканты",
                "Musicians"
              )}
            </span>
            <h1 className="text-2xl sm:text-4xl font-black mt-1">
              {tr(
                "Мусиқачилар каталоги",
                "Musiqachilar katalogi",
                "Каталог музыкантов",
                "Musicians Catalog"
              )}
            </h1>
            <p className="text-slate-400 text-xs sm:text-sm mt-2">
              {tr(
                "Барча истеъдодли мусиқачилар рўйхати.",
                "Barcha iste'dodli musiqachilar ro'yxati.",
                "Список всех талантливых музыкантов.",
                "List of all talented musicians."
              )}
            </p>
          </div>
          <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 sm:flex items-center justify-center text-cyan-400 hidden">
            <Music className="w-8 h-8" />
          </div>
        </div>

        {/* Строка поиска */}
        <div className="flex justify-end">
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder={tr("Мусиқачини қидириш...", "Musiqachini qidirish...", "Поиск музыканта...", "Search musician...")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900/80 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition"
            />
          </div>
        </div>

        {/* Сетка музыкантов */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold">
            {tr(
              "Барча мусиқачилар",
              "Barcha musiqachilar",
              "Все музыканты",
              "All musicians"
            )}
          </h2>

          {loading ? (
            <div className="text-slate-500 text-sm">
              {tr("Юкланмоқда...", "Yuklanmoqda...", "Загрузка...", "Loading...")}
            </div>
          ) : filteredMusicians.length === 0 ? (
            <div className="text-slate-500 text-sm py-12 text-center bg-slate-900/30 rounded-2xl border border-white/5">
              {tr(
                "Мусиқачилар топилмади.",
                "Musiqachilar topilmadi.",
                "Музыканты не найдены.",
                "No musicians found."
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {filteredMusicians.map((musician) => (
                <Link
                  key={musician._id}
                  href={`/musiqachilar/${musician._id}`}
                  className="group p-4 rounded-2xl bg-slate-900/60 border border-white/5 hover:border-cyan-500/40 transition flex flex-col items-center text-center cursor-pointer"
                >
                  <div className="w-20 h-20 rounded-full overflow-hidden bg-slate-800 mb-3 border border-white/10 group-hover:border-cyan-500 transition">
                    {musician.avatar ? (
                      <img
                        src={musician.avatar}
                        alt={musician.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-500">
                        <User className="w-8 h-8" />
                      </div>
                    )}
                  </div>
                  <h3 className="font-bold text-sm text-white group-hover:text-cyan-400 transition truncate w-full">
                    {musician.name}
                  </h3>
                  <p className="text-[10px] text-slate-400 mt-0.5 truncate w-full">
                    {musician.role ||
                      tr("Мусиқачи", "Musiqachi", "Музыкант", "Musician")}
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