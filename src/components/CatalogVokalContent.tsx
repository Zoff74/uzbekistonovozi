"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Sparkles, Mic, Play, Filter, Search, UserCheck, Music, ArrowLeft } from "lucide-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { tr } from "@/utils/translate";

interface Vocalist {
  _id: string;
  name: string;
  genre: string;
  range: string;
  location: string;
  image: string;
  description: string;
}

export default function CatalogVokalContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const categoryParam = searchParams.get("category");

  const [vocalistsList, setVocalistsList] = useState<Vocalist[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGenre, setSelectedGenre] = useState("estrada");
  const [searchQuery, setSearchQuery] = useState("");

  // Синхронизируем фильтр с URL параметром category при его изменении
  useEffect(() => {
    if (categoryParam) {
      setSelectedGenre(categoryParam.toLowerCase());
    }
  }, [categoryParam]);

  // Функция переключения категории с обновлением URL
  const handleCategoryChange = (genreKey: string) => {
    setSelectedGenre(genreKey);
    router.push(`/catalogVokal?category=${genreKey}`, { scroll: false });
  };

  useEffect(() => {
    fetch("/api/vocalists")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setVocalistsList(data);
        } else if (data.vocalists) {
          setVocalistsList(data.vocalists);
        }
      })
      .catch((err) => console.error("Хатолик вокаликларни юклашда:", err))
      .finally(() => setLoading(false));
  }, []);

  const filteredVocalists = vocalistsList.filter((vocalist) => {
    const genreLower = (vocalist.genre || "").toLowerCase();
    const searchLower = searchQuery.toLowerCase();

    let matchesGenre = true;
    if (selectedGenre) {
      if (selectedGenre === "estrada") {
        matchesGenre = genreLower.includes("estrada") || genreLower.includes("эстрада") || genreLower.includes("поп");
      } else if (selectedGenre === "opera") {
        matchesGenre = genreLower.includes("opera") || genreLower.includes("опера") || genreLower.includes("академик") || genreLower.includes("klassik");
      } else if (selectedGenre === "akapella" || selectedGenre === "a cappella") {
        matchesGenre = genreLower.includes("akapella") || genreLower.includes("акапелла") || genreLower.includes("жонли") || genreLower.includes("live");
      } else {
        matchesGenre = genreLower.includes(selectedGenre);
      }
    }

    const matchesSearch = 
      vocalist.name.toLowerCase().includes(searchLower) || 
      genreLower.includes(searchLower) ||
      (vocalist.range && vocalist.range.toLowerCase().includes(searchLower));

    return matchesGenre && matchesSearch;
  });

  return (
    <div className="min-h-screen flex flex-col bg-[#030712] text-white font-sans selection:bg-emerald-500 selection:text-black relative w-full">
      
      {/* Шапка страницы */}
      <header className="border-b border-white/5 bg-[#030712]/90 backdrop-blur-xl z-50 py-3 sm:py-3.5 flex items-center w-full sticky top-0">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 w-full flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Link href="/" className="p-2 rounded-xl bg-slate-900 border border-white/10 hover:border-emerald-500/50 transition flex items-center justify-center text-slate-300 hover:text-[#39FF14]">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            
            <div className="min-w-0 flex flex-col justify-center">
              <span className="font-black tracking-wide bg-gradient-to-r from-white via-slate-200 to-emerald-400 bg-clip-text text-transparent text-sm sm:text-base leading-snug">
                {tr("ВОКАЛ КАСТИНГИ", "VOKAL KASTINGI", "КАСТИНГ ВОКАЛА", "VOCAL CASTING")}
              </span>
              <span className="text-[11px] text-emerald-400 font-bold uppercase">
                {selectedGenre === "opera" && tr("Академик овозлар ва опера", "Akademik ovozlar va opera", "Академические голоса и опера", "Academic voices & opera")}
                {selectedGenre === "estrada" && tr("Эстрада ва оммабоп ижро", "Estrada va ommabop ijro", "Эстрада и популярное исполнение", "Estrada & popular performance")}
                {selectedGenre === "akapella" && tr("Соф овоз ва акапелла", "Sof ovoz va akapella", "Чистый голос и акапелла", "Pure voice & a cappella")}
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 w-full py-8 flex-grow space-y-10">
        
        {/* Динамический пояснительный блок */}
        <div className="relative rounded-3xl border border-emerald-500/30 bg-gradient-to-br from-slate-950/90 via-slate-900/60 to-emerald-950/20 p-6 sm:p-8 backdrop-blur-2xl shadow-[0_0_40px_rgba(16,185,129,0.15)] overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none text-emerald-400">
            <Mic className="w-40 h-40" />
          </div>

          <div className="relative z-10 space-y-4 max-w-4xl">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold tracking-wider uppercase">
              <Sparkles className="w-3.5 h-3.5 animate-spin" /> 
              {selectedGenre === "opera" && tr("Опера ва академик вокал бўлими", "Opera va akademik vokal bo'limi", "Отдел оперы и академического вокала", "Opera & academic vocal section")}
              {selectedGenre === "estrada" && tr("Эстрада ва хит треклар кастинги", "Estrada va hit treklar kastingi", "Кастинг эстрады и хит-треков", "Estrada & hit tracks casting")}
              {selectedGenre === "akapella" && tr("Акапелла ва жонли овозлар майдончаси", "Akapella va jonli ovozlar maydonchasi", "Площадка акапеллы и живых голосов", "A cappella & live voices platform")}
            </div>

            <h1 className="text-xl sm:text-3xl font-extrabold tracking-tight">
              {selectedGenre === "opera" && tr(
                "Опера ва академик ижро каталоги: Юқори диапазон ва соф классика",
                "Opera va akademik ijro katalogi: Yuqori diapazon va sof klassika",
                "Каталог оперы и академического исполнения: Высокий диапазон и чистая классика",
                "Opera & Academic Performance Catalog: High Range & Pure Classics"
              )}
              {selectedGenre === "estrada" && tr(
                "Эстрада каталоги: Замонавий хитлар учун овозлар кастинги",
                "Estrada katalogi: Zamonaviy hitlar uchun ovozlar kastingi",
                "Каталог эстрады: Кастинг голосов для современных хитов",
                "Estrada Catalog: Voice Casting for Modern Hits"
              )}
              {selectedGenre === "akapella" && tr(
                "Акапелла каталоги: Мусиқасиз соф овоз ва жонли тембрлар",
                "Akapella katalogi: Musiqasiz sof ovoz va jonli tembrlar",
                "Каталог акапеллы: Чистый голос без музыки и живые тембры",
                "A Cappella Catalog: Pure Voice Without Music & Live Timbres"
              )}
            </h1>

            <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
              {selectedGenre === "opera" && tr(
                "Ушбу бўлим профессионал саҳна, опера театрлари ва академик лойиҳалар учун кучли овоз соҳибларини кашф этишга мўлжалланган. Бу ерда мусиқий диапазон, нафас ва классик мактаб талабларига жавоб берувчи ноёб ижрочилар жамланган.",
                "Ushbu bo'lim professional sahna, opera teatrlari va akademik loyihalar uchun kuchli ovoz sohiblarini kashf etishga mo'ljallangan. Bu yerda musiqiy diapazon, nafas va klassik maktab talablariga javob beruvchi noyob ijrochilar jamlangan.",
                "Этот раздел предназначен для поиска обладателей мощных голосов для профессиональной сцены, оперных театров и академических проектов. Здесь собраны уникальные исполнители, отвечающие требованиям музыкального диапазона и классической школы.",
                "This section is designed to discover powerful voices for the professional stage, opera houses, and academic projects."
              )}
              {selectedGenre === "estrada" && tr(
                "Эстрада йўналишидаги профессионал хонандалар ва ёш ижрочилар базаси. Замонавий аранжировкалар учун ўзига хос тембрга эга вокаликларни топинг ва ҳамкорликни бошланг.",
                "Estrada yo'nalishidagi professional xonandalar va yosh ijrochilar bazasi. Zamonaviy aranjirovkalar uchun o'ziga xos tembrga ega vokaliklarni toping va hamkorlikni boshlang.",
                "База профессиональных певцов и молодых исполнителей эстрадного направления. Найдите вокалистов с уникальным тембром для современных аранжировок и начните сотрудничество.",
                "Database of professional singers and young performers in the Estrada genre."
              )}
              {selectedGenre === "akapella" && tr(
                "Мусиқа асбобларисиз, тўғридан-тўғри микрофонга ёзилган соф овозлар ва вокал маҳоратини намойиш этувчи акапелла парчалари тўплами.",
                "Musiqa asboblarisiz, to'g'ridan-to'g'ri mikrofonga yozilgan sof ovozlar va vokal mahoratini namoyish etuvchi akapella parchalari to'plami.",
                "Сборник чистых голосов без музыкальных инструментов, записанных напрямую в микрофон, и акапельных фрагментов, демонстрирующих вокальное мастерство.",
                "Collection of pure voices without musical instruments recorded directly into the microphone."
              )}
            </p>
          </div>
        </div>

        {/* Поиск и фильтры каталога */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text"
              placeholder={tr("Хонанда ёки жанр бўйича қидирув...", "Xonanda yoki janr bo'yicha qidiruv...", "Поиск по исполнителю или жанру...", "Search by artist or genre...")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900/80 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 transition"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-2 sm:pb-0">
            <Filter className="w-4 h-4 text-slate-400 flex-shrink-0 ml-1" />
            {[
              { key: "estrada", label: tr("Эстрада", "Estrada", "Эстрада", "Estrada") },
              { key: "opera", label: tr("Опера", "Opera", "Опера", "Opera") },
              { key: "akapella", label: tr("Акапелла", "Akapella", "Акапелла", "A cappella") }
            ].map((genreObj) => (
              <button
                key={genreObj.key}
                onClick={() => handleCategoryChange(genreObj.key)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold uppercase transition whitespace-nowrap ${
                  selectedGenre === genreObj.key 
                    ? "bg-emerald-500 text-black shadow-[0_0_15px_rgba(16,185,129,0.3)]" 
                    : "bg-slate-900 text-slate-300 border border-white/5 hover:border-emerald-500/30"
                }`}
              >
                {genreObj.label}
              </button>
            ))}
          </div>
        </div>

        {/* Сетка карточек вокалистов */}
        {loading ? (
          <div className="flex justify-center items-center py-20">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredVocalists.length === 0 ? (
          <div className="text-slate-500 text-sm py-12 text-center border border-white/5 rounded-2xl bg-slate-950/40">
            {tr("Ижрочилар топилмади.", "Ijrochilar topilmadi.", "Исполнители не найдены.", "No vocalists found.")}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredVocalists.map((vocalist) => (
              <div 
                key={vocalist._id}
                className="group relative rounded-2xl border border-white/10 bg-slate-900/40 hover:border-emerald-500/40 transition-all duration-300 p-5 flex flex-col justify-between overflow-hidden shadow-lg hover:shadow-[0_10px_30px_rgba(16,185,129,0.1)]"
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none group-hover:bg-emerald-500/10 transition-all" />

                <div className="space-y-4 relative z-10">
                  <div className="flex items-center space-x-4">
                    <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-emerald-500/30 overflow-hidden flex-shrink-0 relative">
                      <img src={vocalist.image || "/img/microfon.avif"} alt={vocalist.name} className="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
                    </div>
                    <div>
                      <h3 className="font-bold text-base text-white group-hover:text-emerald-400 transition-colors">
                        {vocalist.name}
                      </h3>
                      <span className="inline-block px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 text-[10px] font-bold uppercase mt-1">
                        {vocalist.range}
                      </span>
                      <p className="text-xs text-slate-400 mt-1">{vocalist.location}</p>
                    </div>
                  </div>

                  <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed">
                    {vocalist.description}
                  </p>

                  <div className="text-[11px] font-semibold text-cyan-400 uppercase tracking-wider">
                    {vocalist.genre}
                  </div>
                </div>

                <div className="pt-5 mt-5 border-t border-white/5 flex items-center justify-between relative z-10">
                  <Link 
                    href={`/qoshiq-ijrochilari/${vocalist._id}`}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-black text-xs font-bold uppercase transition-all duration-300 w-full justify-center group/btn"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>{tr("Овозни тинглаш", "Ovozni tinglash", "Слушать голос", "Listen to voice")}</span>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}

      </main>

      <footer className="border-t border-white/5 bg-black py-4 text-center text-xs text-slate-600 tracking-wider">
        <p>{tr("© 2026 Ўзбекистон овози. Вокал каталоги.", "© 2026 O'zbekiston ovozi. Vokal katalogi.", "© 2026 Голос Узбекистана. Каталог вокала.", "© 2026 Uzbekistan Voice. Vocal catalog.")}</p>
      </footer>

    </div>
  );
}