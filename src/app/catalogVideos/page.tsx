"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Loader2, Film } from "lucide-react";
import { tr } from "@/utils/translate";
import VideoCard from "@/components/VideoCard";

interface IVideoItem {
  _id: string;
  id?: string;
  title: string;
  singer: string;
  duration?: string;
  videoUrl?: string;
  cover?: string;
  views?: number;
  status: string;
  expiresAt: string; // 👈 Сделано обязательным
  createdAt: string; // 👈 Сделано обязательным
  genre?: string;
  downloadsCount?: number;
  isPaidActive?: boolean;
  isExpired?: boolean;
  authorId?: any;
}

export default function VideosPage() {
  const [videos, setVideos] = useState<IVideoItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/videos", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.videos)) {
          setVideos(data.videos);
        } else if (Array.isArray(data)) {
          setVideos(data);
        } else {
          setVideos([]);
        }
      })
      .catch((err) => console.error(tr("Клипларни юклашда хатолик:", "Kliplarni yuklashda xatolik:", "Ошибка загрузки клипов:", "Error loading clips:"), err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-[#030712] text-white flex flex-col font-sans selection:bg-emerald-500 selection:text-black overflow-x-hidden relative">
      
      {/* Неоновый фон */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-emerald-600/15 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-[10%] right-[-10%] w-[600px] h-[600px] bg-cyan-600/10 rounded-full blur-[160px] pointer-events-none" />

      {/* Шапка */}
      <header className="border-b border-white/5 bg-[#030712]/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center space-x-3">
            <span className="text-base font-black tracking-widest bg-gradient-to-r from-white via-slate-200 to-emerald-400 bg-clip-text text-transparent">
              {tr("«ЎЗБЕКИСТОН ОВОЗИ»", "«O'ZBEKISTON OVOZI»", "«ГОЛОС УЗБЕКИСТАНА»", "«UZBEKISTAN VOICE»")} — {tr("КЛИПЛАР", "KLIPLAR", "КЛИПЫ", "CLIPS")}
            </span>
          </Link>
          <Link href="/" className="text-sm text-slate-400 hover:text-white transition">
            ← {tr("Бош саҳифага қайтиш", "Bosh sahifaga qaytish", "Вернуться на главную", "Back to home")}
          </Link>
        </div>
      </header>

      {/* Основной контент */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 py-12 w-full space-y-10 relative z-10">
        
        <div className="flex items-center justify-between border-b border-white/5 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
            <h1 className="text-xl sm:text-2xl font-black tracking-tight flex items-center gap-2">
              <Film className="w-6 h-6 text-emerald-400" /> {tr("Янги видеоклиплар", "Yangi videokliplar", "Новые видеоклипы", "New video clips")}
            </h1>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-32">
            <Loader2 className="w-10 h-10 text-emerald-400 animate-spin" />
          </div>
        ) : videos.length === 0 ? (
          <div className="text-center py-20 text-slate-500 text-sm border border-white/5 rounded-3xl bg-slate-950/40">
            {tr("Ҳозирча видеоклиплар мавжуд эмас. Базага қўшинг!", "Hozircha videokliplar mavjud emas. Bazaga qo'shing!", "Видеоклипы пока отсутствуют. Добавьте в базу!", "No video clips available yet. Add to database!")}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {videos.map((video) => {
              const videoId = String(video._id || video.id || "");
              return (
                <VideoCard 
                  key={videoId} 
                  video={video} 
                  onDelete={(deletedId) => {
                    setVideos((prev) => prev.filter((v) => String(v._id || v.id) !== String(deletedId)));
                  }}
                />
              );
            })}
          </div>
        )}
      </main>

      {/* Футер */}
      <footer className="border-t border-white/5 bg-black py-12 text-center text-xs text-slate-600 tracking-wider">
        <p>{tr("© 2026 Ўзбекистон овози. Барча ҳуқуқлар ҳимояланган.", "© 2026 O'zbekiston ovozi. Barcha huquqlar himoyalangan.", "© 2026 Голос Узбекистана. Все права защищены.", "© 2026 Uzbekistan Voice. All rights reserved.")}</p>
      </footer>
    </div>
  );
}