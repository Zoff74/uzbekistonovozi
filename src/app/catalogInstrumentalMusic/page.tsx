"use client";
// src/app/catalogInstrumentalMusic/page.tsx

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Headphones, Loader2, Music, Play } from "lucide-react";
import { getOptimizedImageUrl } from "@/lib/imagekit";
import { tr } from "@/utils/translate";

interface ITrackItem {
  _id: string;
  title: string;
  singer: string;
  duration: string;
  audioUrl: string;
  cover: string;
  plays: string;
  genre?: string;
}

export default function CatalogInstrumentalMusicPage() {
  const [musicTracks, setMusicTracks] = useState<ITrackItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/tracks")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.tracks)) {
          setMusicTracks(data.tracks);
        } else if (Array.isArray(data)) {
          setMusicTracks(data);
        }
      })
      .catch((err) =>
        console.error(
          tr(
            "Мусиқаларни юклашда хатолик:",
            "Musiqalarni yuklashda xatolik:",
            "Ошибка загрузки музыки:",
            "Error loading music:"
          ),
          err
        )
      )
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-[#030712] text-white flex flex-col font-sans selection:bg-cyan-500 selection:text-black overflow-x-hidden relative">
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-cyan-600/15 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-[10%] right-[-10%] w-[600px] h-[600px] bg-blue-600/10 rounded-full blur-[160px] pointer-events-none" />

      {/* Шапка */}
      <header className="border-b border-white/5 bg-[#030712]/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between">
          <Link href="/catalog" className="flex items-center space-x-3">
            <span className="text-base font-black tracking-widest bg-gradient-to-r from-white via-slate-200 to-cyan-400 bg-clip-text text-transparent">
              {tr("«ЎЗБЕКИСТОН ОВОЗИ»", "«O'ZBEKISTON OVOZI»", "«ГОЛОС УЗБЕКИСТАНА»", "«UZBEKISTAN VOICE»")} — {tr("Инструментал мусиқа", "Instrumental musiqa", "Инструментальная музыка", "Instrumental Music")}
            </span>
          </Link>
          <Link href="/catalog" className="text-sm text-slate-400 hover:text-white transition">
            ← {tr("Каталогга қайтиш", "Katalogga qaytish", "Вернуться в каталог", "Back to catalog")}
          </Link>
        </div>
      </header>

      {/* Основной контент */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 py-12 w-full space-y-10 relative z-10">
        <div className="flex items-center justify-between border-b border-white/5 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-cyan-500 animate-ping" />
            <h1 className="text-xl sm:text-2xl font-black tracking-tight flex items-center gap-2">
              <Music className="w-6 h-6 text-cyan-400" /> {tr("Инструментал мусиқа", "Instrumental musiqa", "Инструментальная музыка", "Instrumental Music")}
            </h1>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-32">
            <Loader2 className="w-10 h-10 text-cyan-400 animate-spin" />
          </div>
        ) : musicTracks.length === 0 ? (
          <div className="text-center py-20 text-slate-500 text-sm border border-white/5 rounded-3xl bg-slate-950/40">
            {tr("Ҳозирча треклар мавжуд эмас.", "Hozircha treklar mavjud emas.", "Треки пока отсутствуют.", "No tracks available yet.")}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {musicTracks.map((track) => (
              <div
                key={track._id}
                className="group bg-gradient-to-b from-slate-900/50 to-slate-950/85 border border-white/5 hover:border-cyan-500/50 rounded-3xl p-4 transition-all duration-500 flex flex-col justify-between shadow-2xl hover:shadow-[0_0_30px_rgba(6,182,212,0.15)]"
              >
                <div>
                  <div className="relative aspect-square rounded-2xl overflow-hidden bg-slate-900 mb-4 shadow-xl" onContextMenu={(e) => e.preventDefault()}>
                    <img
                      src={getOptimizedImageUrl(track.cover, 600, 600, 75)}
                      alt={track.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <div className="w-12 h-12 rounded-full bg-cyan-500 text-slate-950 flex items-center justify-center shadow-lg transform scale-90 group-hover:scale-100 transition">
                        <Play className="w-6 h-6 fill-current ml-0.5" />
                      </div>
                    </div>
                    <div className="absolute top-3 right-3 px-3 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-[11px] font-bold text-cyan-400 flex items-center gap-1 pointer-events-none">
                      <Headphones className="w-3 h-3" /> {track.plays || 0}
                    </div>
                  </div>
                  <h3 className="font-black text-lg text-white group-hover:text-cyan-400 transition truncate">{track.title}</h3>
                  <p className="text-sm text-slate-400 truncate mt-0.5">{track.singer}</p>
                </div>

                <div className="mt-4 pt-3 border-t border-white/5 space-y-3">
                  <audio
                    src={track.audioUrl}
                    controls
                    preload="none"
                    controlsList="nodownload"
                    className="w-full h-9 accent-cyan-500 opacity-90 hover:opacity-100 transition"
                  />
                  <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                    <span>{tr("Давомийлиги", "Davomiyligi", "Длительность", "Duration")}: {track.duration || "--:--"}</span>
                    <span className="text-cyan-400 font-bold">{track.genre || tr("Инструментал", "Instrumental", "Инструментал", "Instrumental")}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <footer className="border-t border-white/5 bg-black py-12 text-center text-xs text-slate-600 tracking-wider">
        <p>{tr("© 2026 Ўзбекистон овози. Барча ҳуқуқлар ҳимояланган.", "© 2026 O'zbekiston ovozi. Barcha huquqlar himoyalangan.", "© 2026 Голос Узбекистана. Все права защищены.", "© 2026 Uzbekistan Voice. All rights reserved.")}</p>
      </footer>
    </div>
  );
}