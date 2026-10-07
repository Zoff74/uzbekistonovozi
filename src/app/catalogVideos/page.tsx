"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Eye, Loader2, Film } from "lucide-react";
import { getOptimizedVideoUrl, getOptimizedImageUrl } from "@/lib/imagekit";
import { tr } from "@/utils/translate";

interface IVideoItem {
  _id: string;
  title: string;
  singer: string;
  duration: string;
  videoUrl: string;
  cover: string;
  views: string;
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
            {videos.map((video) => (
              <div 
                key={video._id}
                className="group bg-gradient-to-b from-slate-900/50 to-slate-950/85 border border-white/5 hover:border-emerald-500/50 rounded-3xl p-4 transition-all duration-500 flex flex-col justify-between shadow-2xl hover:shadow-[0_0_30px_rgba(16,185,129,0.15)]"
              >
                <div>
                  {/* Плеер видео с оптимизацией через ImageKit */}
                  <div 
                    className="relative aspect-video rounded-2xl overflow-hidden bg-slate-900 mb-4 shadow-xl"
                    onContextMenu={(e) => e.preventDefault()}
                  >
                    <video 
                      src={getOptimizedVideoUrl(video.videoUrl, 70)} 
                      poster={getOptimizedImageUrl(video.cover, 800, 450, 75)}
                      controls 
                      preload="none"
                      playsInline
                      controlsList="nodownload"
                      className="w-full h-full object-cover"
                    />
                    
                    <div className="absolute top-3 right-3 px-3 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-[11px] font-bold text-emerald-400 flex items-center gap-1 pointer-events-none">
                      <Eye className="w-3 h-3" /> {video.views}
                    </div>
                  </div>

                  <h3 className="font-black text-lg text-white group-hover:text-emerald-400 transition truncate">{video.title}</h3>
                  <p className="text-sm text-slate-400 truncate mt-0.5">{video.singer}</p>
                </div>
                
                <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-xs text-slate-500 font-medium">
                  <span>{tr("Давомийлиги", "Davomiyligi", "Длительность", "Duration")}: {video.duration}</span>
                  <span className="text-emerald-400 font-bold">{tr("Юқори сифат", "Yuqori sifat", "Высокое качество", "High quality")}</span>
                </div>
              </div>
            ))}
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