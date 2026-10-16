"use client";

// src/app/musiqachilar/[id]/page.tsx

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ArrowLeft, User, Phone, Send, Music, Mail, MapPin, Video as VideoIcon } from "lucide-react";
import { tr } from "@/utils/translate";
import TrackCard from "@/components/TrackCard";
import VideoCard from "@/components/VideoCard";

interface MusicianProfile {
  _id: string;
  name?: string;
  username?: string;
  image?: string;
  occupation?: string;
  instrument?: string;
  instruments?: string[];
  bio?: string;
  phone?: string;
  phoneNumber?: string;
  telegram?: string;
  email?: string;
  location?: string;
}

export default function MusicianProfilePage() {
  const params = useParams();
  const id = params?.id as string;
  const { data: session } = useSession();

  const [musician, setMusician] = useState<MusicianProfile | null>(null);
  const [tracks, setTracks] = useState<any[]>([]);
  const [videos, setVideos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    setLoading(true);

    // 1. Загрузка данных профиля
    const fetchUser = fetch(`/api/user/profile?id=${id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.user) return data.user;
        if (data._id) return data;
        return null;
      })
      .catch((err) => {
        console.error("Ошибка при загрузке профиля:", err);
        return null;
      });

    // 2. Загрузка треков музыканта
    const fetchTracks = fetch(`/api/tracks?author=${id}`)
      .then((res) => res.json())
      .then((data) => (Array.isArray(data) ? data : data.tracks || []))
      .catch(() => []);

    // 3. Загрузка видео/клипов музыканта
    const fetchVideos = fetch(`/api/videos?author=${id}`)
      .then((res) => res.json())
      .then((data) => (Array.isArray(data) ? data : data.videos || []))
      .catch(() => []);

    Promise.all([fetchUser, fetchTracks, fetchVideos])
      .then(([userData, userTracks, userVideos]) => {
        if (userData) {
          setMusician(userData);
        }
        setTracks(userTracks);
        setVideos(userVideos);
      })
      .finally(() => setLoading(false));
  }, [id]);

  // Проверка: является ли текущий залогиненный пользователь владельцем этой страницы
  const isOwner = Boolean(session?.user?.id && id && session.user.id === id);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#030712] text-white flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!musician) {
    return (
      <div className="min-h-screen bg-[#030712] text-white flex flex-col items-center justify-center p-4">
        <p className="text-slate-400 text-sm mb-4">
          {tr("Мусиқачи топилмади.", "Musiqachi topilmadi.", "Музыкант не найден.", "Musician not found.")}
        </p>
        <Link
          href="/catalogMusiqachilar"
          className="px-4 py-2 bg-cyan-500 text-black rounded-xl text-xs font-bold uppercase transition hover:bg-cyan-400"
        >
          {tr("Каталогга қайтиш", "Katalogga qaytish", "Вернуться в каталог", "Back to catalog")}
        </Link>
      </div>
    );
  }

  const displayName = musician.name || musician.username || "Мусиқачи";
  const displayPhone = musician.phone || musician.phoneNumber;

  const userInstruments = musician.instruments && musician.instruments.length > 0 
    ? musician.instruments 
    : (musician.instrument ? [musician.instrument] : []);

  return (
    <div className="min-h-screen bg-[#030712] text-white p-4 sm:p-8 pt-24 font-sans selection:bg-cyan-500 selection:text-black">
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* Кнопка назад */}
        <Link
          href="/catalogMusiqachilar"
          className="inline-flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-cyan-400 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          {tr("Каталогга қайтиш", "Katalogga qaytish", "Назад в каталог", "Back to catalog")}
        </Link>

        {/* Главная карточка-профиль */}
        <div className="relative rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/90 via-slate-900/50 to-cyan-950/20 p-6 sm:p-8 backdrop-blur-2xl shadow-2xl overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 relative z-10">
            
            {/* Аватар */}
            <div className="w-32 h-32 sm:w-40 sm:h-40 rounded-2xl bg-slate-800 border-2 border-cyan-500/30 overflow-hidden flex-shrink-0 shadow-lg">
              {musician.image ? (
                <img
                  src={musician.image}
                  alt={displayName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-500">
                  <User className="w-16 h-16" />
                </div>
              )}
            </div>

            {/* Основная информация */}
            <div className="flex-grow text-center sm:text-left space-y-3">
              <div>
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mb-2">
                  <span className="inline-block px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-bold uppercase tracking-wider">
                    {musician.occupation || tr("Мусиқачи", "Musiqachi", "Музыкант", "Musician")}
                  </span>
                  
                  {userInstruments.map((inst, index) => (
                    <span key={index} className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold uppercase tracking-wider">
                      <Music className="w-3 h-3" />
                      {inst}
                    </span>
                  ))}
                </div>

                <h1 className="text-2xl sm:text-3xl font-black text-white">{displayName}</h1>
              </div>

              {musician.location && (
                <p className="flex items-center justify-center sm:justify-start gap-1.5 text-xs text-slate-400">
                  <MapPin className="w-4 h-4 text-cyan-400" />
                  {musician.location}
                </p>
              )}

              <p className="text-slate-300 text-sm leading-relaxed pt-2 border-t border-white/5">
                {musician.bio || tr(
                  "Салом! Мен ушбу платформада ўз хизматларимни таклиф қиламан. Ҳамкорлик қилиш ва қўшиқ ёзиш учун мен билан боғланишингиз мумкин.",
                  "Salom! Men o'z xizmatlarimni ushbu platformada taklif qilaman. Siz hamkorlik qilish va qo'shiq yozish uchun men bilan bog'lanishingiz mumkin.",
                  "Привет! Я предлагаю свои услуги на этой платформе. Вы можете связаться со мной для сотрудничества и записи песни.",
                  "Hello there! I offer my services on this platform. You can contact me to collaborate and record a song."
                )}
              </p>

              {/* Кнопки связи */}
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 pt-4">
                {displayPhone && (
                  <a
                    href={`tel:${displayPhone}`}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 hover:bg-cyan-500 hover:text-black text-cyan-400 text-xs font-bold transition shadow-md"
                  >
                    <Phone className="w-4 h-4" />
                    <span>{displayPhone}</span>
                  </a>
                )}

                {musician.telegram && (
                  <a
                    href={`https://t.me/${musician.telegram.replace("@", "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-500/10 border border-sky-500/30 hover:bg-sky-500 hover:text-black text-sky-400 text-xs font-bold transition shadow-md"
                  >
                    <Send className="w-4 h-4" />
                    <span>@{musician.telegram.replace("@", "")}</span>
                  </a>
                )}
              </div>

            </div>
          </div>
        </div>

        {/* Секция Аудиозаписей / Исполнений */}
        {tracks.length > 0 && (
          <div className="space-y-4 pt-4">
            <div className="flex items-center gap-2 border-b border-white/10 pb-3">
              <Music className="w-5 h-5 text-[#39FF14]" />
              <h2 className="text-xl font-bold text-white tracking-wide">
                {tr("Мусиқий асарлар ва аудиолар", "Musiqiy asarlar va audiolar", "Аудиозаписи и авторитетные треки", "Audio Tracks")}
              </h2>
              <span className="text-xs text-gray-400 bg-white/5 px-2.5 py-0.5 rounded-full border border-white/10">
                {tracks.length}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {tracks.map((track) => (
                <TrackCard key={track._id} track={track} isOwner={isOwner} />
              ))}
            </div>
          </div>
        )}

        {/* Секция Видеоклипов / Выступлений */}
        {videos.length > 0 && (
          <div className="space-y-4 pt-4">
            <div className="flex items-center gap-2 border-b border-white/10 pb-3">
              <VideoIcon className="w-5 h-5 text-[#FFDA09]" />
              <h2 className="text-xl font-bold text-white tracking-wide">
                {tr("Видео ижролар ва клиплар", "Video ijrolar va kliplar", "Видеовыступления и клипы", "Video Performances")}
              </h2>
              <span className="text-xs text-gray-400 bg-white/5 px-2.5 py-0.5 rounded-full border border-white/10">
                {videos.length}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {videos.map((video) => (
                <VideoCard key={video._id} video={video} isOwner={isOwner} />
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}