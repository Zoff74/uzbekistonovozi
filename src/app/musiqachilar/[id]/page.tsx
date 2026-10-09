"use client";

// src/app/musiqachilar/[id]/page.tsx
import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, User, Phone, Send, Music, Mail, MapPin } from "lucide-react";
import { tr } from "@/utils/translate";

interface MusicianProfile {
  _id: string;
  name: string;
  image: string;
  occupation: string;
  bio?: string;
  phone?: string;
  telegram?: string;
  email?: string;
  location?: string;
}

export default function MusicianProfilePage() {
  const params = useParams();
  const id = params?.id;

  const [musician, setMusician] = useState<MusicianProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    fetch(`/api/user/profile?id=${id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.user) {
          setMusician(data.user);
        } else if (data._id) {
          setMusician(data);
        }
      })
      .catch((err) =>
        console.error(
          tr(
            "Мусиқачи маълумотларини юклашда хатолик:",
            "Musiqachi ma'lumotlarini yuklashda xatolik:",
            "Ошибка при загрузке данных музыканта:",
            "Error loading musician data:"
          ),
          err
        )
      )
      .finally(() => setLoading(false));
  }, [id]);

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

  return (
    <div className="min-h-screen bg-[#030712] text-white p-4 sm:p-8 pt-24 font-sans selection:bg-cyan-500 selection:text-black">
      <div className="max-w-4xl mx-auto space-y-8">
        
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
                  alt={musician.name}
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
                <span className="inline-block px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-bold uppercase tracking-wider mb-2">
  {musician.occupation || tr("Мусиқачи", "Musiqachi", "Музыкант", "Musician")}
</span>
                <h1 className="text-2xl sm:text-3xl font-black text-white">{musician.name}</h1>
              </div>

              {musician.location && (
                <p className="flex items-center justify-center sm:justify-start gap-1.5 text-xs text-slate-400">
                  <MapPin className="w-4 h-4 text-cyan-400" />
                  {musician.location}
                </p>
              )}

              {/* Самопрезентация */}
              <p className="text-slate-300 text-sm leading-relaxed pt-2 border-t border-white/5">
                {musician.bio || tr(
                  "Салом! Мен ушбу платформада ўз хизматларимни таклиф қиламан. Ҳамкорлик ва ёзувлар учун боғланишингиз мумкин.",
                  "Salom! Men ushbu platformada o'z xizmatlarimni taklif qilaman. Hamkorlik va yozuvlar uchun bog'lanishingiz mumkin.",
                  "Привет! Я предлагаю свои услуги на этой платформе. Вы можете связаться со мной для сотрудничества и записи.",
                  "Hello! I offer my services on this platform. You can contact me for collaboration."
                )}
              </p>

              {/* Кнопки связи (Телефон / Telegram) */}
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 pt-4">
                {musician.phone && (
                  <a
                    href={`tel:${musician.phone}`}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 hover:bg-cyan-500 hover:text-black text-cyan-400 text-xs font-bold transition shadow-md"
                  >
                    <Phone className="w-4 h-4" />
                    <span>{musician.phone}</span>
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

      </div>
    </div>
  );
}