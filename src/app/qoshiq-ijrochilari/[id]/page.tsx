"use client";

// src/app/qoshiq-ijrochilari/[id]/page.tsx
import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Music, Video, Phone, CheckCircle2 } from "lucide-react";
import { tr } from "@/utils/translate";

interface SingerProfile {
  _id: string;
  name: string;
  role: string;
  avatar: string;
  bio: string;
  phone: string;
  email: string;
  isVerified: boolean;
  stats: {
    totalTracks: number;
    totalPlays: string;
  };
}

interface Track {
  _id: string;
  title: string;
  genre: string;
  duration: string;
  cover: string;
  audioUrl: string;
  plays: string;
}

interface Clip {
  _id: string;
  title: string;
  videoUrl: string;
  thumbnail: string;
}

export default function SingerProfilePage() {
  const params = useParams();
  const singerId = params.id as string;

  const [singer, setSinger] = useState<SingerProfile | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [clips, setClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!singerId) return;

    // Загружаем данные конкретного исполнителя песен по уникальному ID из БД
    fetch(`/api/qoshiq-ijrochilari/${singerId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data) {
          setSinger(data.singer);
          setTracks(data.tracks || []);
          setClips(data.clips || []);
        }
      })
      .catch((err) => console.error("Хатолик қўшиқ ижрочиси профилини юклашда:", err))
      .finally(() => setLoading(false));
  }, [singerId]);

  if (loading) {
    return (
      <div className="bg-[#030712] text-white min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!singer) {
    return (
      <div className="bg-[#030712] text-white min-h-screen flex flex-col items-center justify-center space-y-4">
        <p className="text-slate-400">
          {tr("Қўшиқ ижрочиси топилмади ёки ўчириб юборилган.", "Qo'shiq ijrochisi topilmadi yoki o'chirib yuborilgan.", "Исполнитель песен не найден или удален.", "Singer not found or deleted.")}
        </p>
        <Link href="/" className="text-emerald-400 text-sm font-bold hover:underline">
          {tr("Бош саҳифага қайтиш", "Bosh sahifaga qaytish", "Вернуться на главную", "Back to home")}
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-[#030712] text-white min-h-screen pb-20">
      
      {/* Шапка профиля */}
      <div className="relative bg-gradient-to-b from-emerald-950/30 via-slate-900/50 to-[#030712] border-b border-white/5 pt-8 pb-12 px-4 sm:px-8">
        <div className="max-w-5xl mx-auto space-y-6">
          
          <Link 
            href="javascript:history.back()" 
            className="inline-flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-emerald-400 transition cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" /> {tr("Орқага қайтиш", "Orqaga qaytish", "Назад", "Go back")}
          </Link>

          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
            <div className="w-32 h-32 sm:w-40 sm:h-40 rounded-3xl overflow-hidden bg-slate-800 border-2 border-emerald-500/40 shadow-[0_0_30px_rgba(16,185,129,0.2)] flex-shrink-0">
              <img src={singer.avatar || "/img/microfon.avif"} alt={singer.name} className="w-full h-full object-cover" />
            </div>

            <div className="text-center sm:text-left space-y-2 flex-1">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
                  {singer.role}
                </span>
                {singer.isVerified && (
                  <span className="flex items-center gap-1 text-xs text-cyan-400 font-bold">
                    <CheckCircle2 className="w-4 h-4" /> {tr("Тасдиқланган профиль", "Tasdiqlangan profil", "Подтвержденный профиль", "Verified profile")}
                  </span>
                )}
              </div>

              <h1 className="text-2xl sm:text-4xl font-black">{singer.name}</h1>
              
              <p className="text-slate-400 text-xs sm:text-sm max-w-2xl leading-relaxed">
                {singer.bio || tr("Қўшиқ ижрочиси ҳақида ҳозирча маълумот қўшилмаган.", "Qo'shiq ijrochisi haqida hozircha ma'lumot qo'shilmagan.", "Об исполнителе песен пока нет информации.", "No information about the singer yet.")}
              </p>

              {/* Статистика и контакты */}
              <div className="pt-2 flex flex-wrap items-center justify-center sm:justify-start gap-6 text-xs text-slate-300">
                <div><strong className="text-white">{singer.stats.totalTracks}</strong> {tr("та трек", "ta trek", "треков", "tracks")}</div>
                <div><strong className="text-white">{singer.stats.totalPlays}</strong> {tr("тинглов", "tinglov", "прослушиваний", "plays")}</div>
                {singer.phone && (
                  <a href={`tel:${singer.phone}`} className="flex items-center gap-1 text-emerald-400 hover:underline">
                    <Phone className="w-3.5 h-3.5" /> {tr("Буюртма бериш / Боғланиш", "Buyurtma berish / Bog'lanish", "Заказать выступление / Связаться", "Book / Contact")}
                  </a>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Основной контент: песни и Клипы */}
      <div className="max-w-5xl mx-auto px-4 sm:px-8 mt-8 space-y-10">
        
        {/* Песни и музыка исполнителя */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 border-b border-white/5 pb-3">
            <Music className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold">{tr("Ижрочининг барча қўшиқлари", "Ijrochining barcha qo'shiqlari", "Все песни исполнителя", "All songs by the singer")}</h2>
          </div>

          {tracks.length === 0 ? (
            <div className="text-slate-500 text-sm py-6 text-center border border-white/5 rounded-2xl bg-slate-950/40">
              {tr("Ҳозирча қўшиқлар юкланмаган.", "Hozircha qo'shiqlar yuklanmagan.", "Песни пока не загружены.", "No songs uploaded yet.")}
            </div>
          ) : (
            <div className="space-y-2">
              {tracks.map((track) => (
                <div 
                  key={track._id}
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-900/40 border border-white/5 hover:border-emerald-500/30 transition"
                >
                  <div className="flex items-center gap-3">
                    <img src={track.cover} alt={track.title} className="w-12 h-12 rounded-lg object-cover" />
                    <div>
                      <h4 className="font-bold text-sm text-white">{track.title}</h4>
                      <span className="text-[10px] text-emerald-400 bg-white/5 px-1.5 py-0.5 rounded">{track.genre}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-slate-500">{track.duration}</span>
                    <span className="text-xs text-emerald-400 font-semibold cursor-pointer hover:underline">{tr("Тинглаш", "Tinglash", "Слушать", "Listen")}</span>
                    <span className="text-xs text-cyan-400 font-semibold cursor-pointer hover:underline">{tr("Юклаб олиш (Тўлов орқали)", "Yuklab olish (To'lov orqali)", "Скачать (Платные)", "Download (Paid)")}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Клипы/Видео исполнителя */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 border-b border-white/5 pb-3">
            <Video className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold">{tr("Видеоклиплар", "Videokliplar", "Видеоклипы", "Video clips")}</h2>
          </div>

          {clips.length === 0 ? (
            <div className="text-slate-500 text-sm py-6 text-center border border-white/5 rounded-2xl bg-slate-950/40">
              {tr("Ҳозирча клиплар мавжуд эмас.", "Hozircha kliplar mavjud emas.", "Клипы пока отсутствуют.", "No clips available yet.")}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {clips.map((clip) => (
                <div key={clip._id} className="group rounded-2xl overflow-hidden bg-slate-900 border border-white/5 p-3 space-y-2">
                  <div className="aspect-video rounded-xl bg-black overflow-hidden relative">
                    <img src={clip.thumbnail} alt={clip.title} className="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
                  </div>
                  <h4 className="font-bold text-sm text-white truncate">{clip.title}</h4>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

    </div>
  );
}