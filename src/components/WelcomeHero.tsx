"use client";

// БЛОК - "WelcomeHero" src\components\WelcomeHero.tsx
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import Header from "@/components/Header"; // Импортируем вынесенную шапку
import FireworkCanvas from "@/components/FireworkCanvas";
import { tr } from "@/utils/translate";

const imagesList = [
  "/img/muzikanti.webp",
  "/img/microfonyarkiy.avif",
  "/img/muzikanti.webp",
  "/img/MuhiddinNasreddinov.webp",
  "/img/muzikanti.webp",
  "/img/MuhtorAshrafi.webp",
  "/img/muzikanti.webp",
  "/img/konservatoriyafasad.webp",
  "/img/muzikanti.webp",
  "/img/FaruhZakirov.jpg",
  "/img/muzikanti.webp",
  "/img/konservatoriyaorgan.webp",
  "/img/muzikanti.webp",
  "/img/konservatoriyadeti.webp",
  "/img/muzikanti.webp",
  "/img/FaruhZakirov.webp",        
  "/img/muzikanti.webp",
  "/img/tamada.webp",
  "/img/muzikanti.webp", 
  "/img/tamada2.webp",
];

const INITIAL_ANGLE = -15;

export default function WelcomeHero() {
  const [rotation, setRotation] = useState(INITIAL_ANGLE);      
  const [frontIdx, setFrontIdx] = useState(0); 
  const [backIdx, setBackIdx] = useState(1);   

  useEffect(() => {
    imagesList.forEach((src) => {
      const img = new Image();
      img.src = src;
    });
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setRotation((prev) => prev + 180);
    }, 5000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (rotation === INITIAL_ANGLE) return;

    const timeout = setTimeout(() => {
      const flipCount = (rotation - INITIAL_ANGLE) / 180;

      if (flipCount % 2 !== 0) {
        setFrontIdx((prev) => (backIdx + 1) % imagesList.length);
      } else {
        setBackIdx((prev) => (frontIdx + 1) % imagesList.length);
      }
    }, 350);

    return () => clearInterval(timeout);
  }, [rotation]);

  return (
    <div className="min-h-screen lg:h-screen flex flex-col bg-[#030712] text-white font-sans selection:bg-emerald-500 selection:text-black relative w-full lg:overflow-hidden">
      
      <FireworkCanvas disableClick />

      <div className="absolute top-[-10%] left-[-10%] w-[350px] lg:w-[400px] h-[350px] lg:h-[400px] bg-emerald-600/15 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-[30%] right-[-10%] w-[450px] lg:w-[500px] h-[450px] lg:h-[500px] bg-cyan-600/10 rounded-full blur-[140px] pointer-events-none" />

      {/* Подключаем универсальный компонент шапки */}
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 w-full pt-16 sm:pt-20 lg:pt-4 pb-4 flex items-center lg:overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-8 items-center w-full">
          
          <div className="space-y-2.5 sm:space-y-3">
            <div className="inline-flex flex-col items-center px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[11px] font-bold tracking-wider uppercase backdrop-blur-md">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 animate-spin flex-shrink-0" />
                <span>{tr("Ўзбекистонда Ягона Мусиқий Маркетплейс", "O'zbekistonda Yagona Musiqiy Marketpleys", "Единственный Музыкальный Маркетплейс Узбекистана", "Single Musical Marketplace in Uzbekistan")}</span>
              </div>
              <span className="opacity-90 text-[10px] text-slate-300 text-center block w-full">
                {tr("Янги авлод мусиқий бизнес экотизими", "Yangi avlod musiqiy biznes ekotizimi", "Музыкальная бизнес экосистема нового поколения", "New generation musical ecosystem")}
              </span>
            </div>
            
            <h1 className="text-base sm:text-xl font-bold tracking-tight leading-snug">
              {tr(
                <>Тошкент Давлат Консерваторияси ва Истеъдодларга бой {" "}<span style={{ fontSize: 32, fontFamily: "system-ui", fontWeight: 400, fontStyle: "normal" }}>Ў</span>збекистоннинг Янги Мусиқий Талантларини кашф этинг!</> as any, 
                "Toshkent Davlat Konservatoriyasi va Istedodlarga boy O'zbekistonning Yangi Musiqiy Talantlarini kashf eting!",
                "Откройте для себя новые музыкальные таланты Ташкентской Государственной Консерватории и всего Узбекистана!", 
                "Discover new musical talents of the Tashkent Conservatory and all of Uzbekistan!" 
              )}
            </h1>
            
            <p className="font-badscript text-slate-300 leading-relaxed text-[18px] sm:text-[18px]" style={{ lineHeight: '1.2', whiteSpace: 'pre-line' }}>
              {tr(
                <>
                  'Мухтор Ашрафи' Консерваториясини битирганлар ва ҳозирги кунда <span style={{ fontFamily: "system-ui" }}>Ў</span>збекистон Давлат Консерваториясида таълим олаётган қобилиятли талабаларининг, ҳамда Табиий Истеъдоди орқали ижод қилиб келаётган минглаб мусиқачи, хонанда, бастакор ва қўшиқ матни муаллифлари ўз асарларини жойлаштириш, ўз кучи ва қобилиятини синаш ва мукофот сифатида моддий маблағ олиши учун мўлжалланган <span style={{ fontFamily: "system-ui" }}>Ў</span>збекистондаги Ягона Маркетплейс !!!{'\n'}
                  Агарда Сиз Мусиқа ижодкорлигига ёки Мусиқа саноатига алоқадор бўлсангиз, ижод маҳсулларингизни жойланг ва МАБЛА<span style={{fontSize: 22, fontFamily: "system-ui, sans-serif", fontStyle: "italic" }}>Ғ</span>дан ташқари, Эътироф, Талабгирлик ва Машҳурлик топинг!
                </> as any,
                
                "'Muxtor Ashrafi' Konservatoriyasini bitirganlar va hozirgi kunda O'zbekiston Davlat Konservatoriyasida ta'lim olayotgan qobiliyatli talabalarining, hamda Tabiiy Iste'dodi orqali ijod qilib kelayotgan minglab musiqachi, xonanda, bastakor va qo'shiq matni mualliflari o'z asarlarini joylashtirishi va o'z kuchi va qobiliyatini sinash va mukofot sifatida moddiy mablag olishi uchun mo'ljallangan Uzbekistondagi Yagona Marketpleys !!!\nAgarda Siz Musiqa ijodkorlik sanoatiga aloqador bo'lsangiz, Ijod mahsullaringizni jovlang va MABLAGdan tashqari, E'tirof, Talabgarlik va Mashhurlik toping!",
                
                "Единый маркетплейс для жителей Узбекистана от выпускников Ташкентской Консерватории 'Мухтара Ашрафи' и учащихся Государственной Консерватории Узбекистана, а также тысяч пока не известных музыкантов, певцов, композиторов и авторов текстов, создающих творчество благодаря своему Природному Таланту.\nЕсли Вы талантливы и хотите поведать миру свои произведения или имеете отношение к музыкальной индустрии, РАЗМЕЩАЙТЕ свои услуги, продукты своего творчества — и Вы получите не только МАТЕРИАЛЬНЫЕ СРЕДСТВА, но также обретете Признание, Востребованность и Известность!",
                
                "A Single Marketplace designed for graduates and students of the State Conservatory of Uzbekistan, as well as thousands of musicians, singers, composers and lyricists creating through their natural talent.\nUPLOAD your creative products and gain not only FUNDS, but also Recognition, Demand and Fame!"
              )} 
              <span 
                className="text-center text-emerald-400 font-semibold block mt-1.5 text-[9px] sm:text-[12px]"
                style={{ letterSpacing: '1px' }}
              >
                {tr(
                  <>
                    НАФА<span style={{ fontSize: 18, fontFamily: "system-ui, sans-serif", fontStyle: "italic" }}>Қ</span>АТ <span style={{ fontSize: 18, fontFamily: "system-ui, sans-serif", fontStyle: "italic" }}>Ў</span>ЗБЕКИСТОНЛИКЛАР, БАЛКИ БУТУН ДУНЁ СИЗНИНГ МАХОРАТИНГИЗНИ К<span style={{ fontSize: 18, fontFamily: "system-ui, sans-serif", fontStyle: "italic" }}>Ў</span>РСИН, СИЗНИ ТИНГЛАСИН, СИЗ БИЛАН <span style={{ fontSize: 18, fontFamily: "system-ui, sans-serif", fontStyle: "italic" }}>Ҳ</span>АЙРАТЛАНСИН ВА СИЗНИНГ ИЖОДИНГИЗ БИЛАН ЗАВ<span style={{ fontSize: 18, fontFamily: "system-ui, sans-serif", fontStyle: "italic" }}>Қ</span>ЛАНСИН!
                  </> as any,
                  "NAFAQAT O'ZBEKISTONLIKLAR, BALKI BUTUN DUNYO SIZNING MAXORATINGIZNI KO'RSIN, SIZNI TINGLASIN, SIZ BILAN HAYRATLANSIN VA SIZNING IJODINGIZ BILAN ZAVQLANSIN!",
                  "ПУСТЬ НЕ ТОЛЬКО НАРОД УЗБЕКИСТАНА, НО И ЛЮДИ ВСЕГО МИРА ВИДИТ ВАС, СЛУШАЮТ ВАС, УДИВЛЯЮТСЯ ВАМИ И НАСЛАЖДАЮТСЯ ВАШИМ ТВОРЧЕСТВОМ!",
                  "Let the people of Uzbekistan and the whole world see you, listen and enjoy your creativity!"
                )}
              </span>
            </p>

            <div className="pt-1 flex flex-col sm:flex-row gap-2.5 w-full max-w-md">
              <div className="relative w-full h-[40px] group flex items-center justify-center">
                <div 
                  className="absolute inset-0 rounded-xl z-0 shadow-[0_0_15px_rgba(57,255,20,0.2)] transition-all duration-500 group-hover:shadow-[inset_0_0_20px_rgba(0,0,0,1)] pointer-events-none"
                  style={{
                    padding: '2px',
                    background: 'linear-gradient(to right, #000000, #FFDA09, #39FF14, #FFDA09, #000000)',
                    WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                    WebkitMaskComposite: 'xor',
                    maskComposite: 'exclude',
                  }}
                />
                <Link
                  href="/auth/register?role=listener"
                  className="relative w-[calc(100%-6px)] h-[32px] z-10 flex items-center justify-center text-center rounded-lg bg-gradient-to-r from-black via-black to-[#3a3a3a] text-[#39FF14] text-[11px] font-bold uppercase tracking-wider transition-all duration-300 group-hover:scale-95 group-active:scale-90 group-hover:text-slate-300 px-3 overflow-hidden"
                >
                  <div className="absolute inset-0 w-full h-full pointer-events-none overflow-hidden rounded-md">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#39FF14]/40 to-transparent -translate-x-full group-hover:animate-shimmer" />
                  </div>
                  <span className="relative z-10 drop-shadow-[0_0_5px_rgba(57,255,20,0.5)]">{tr("Тингловчи сифатида Жамоага қўшилиш", "Tinglovchi sifatida Jamoaga qo'shilish", "Присоединиться для прослушивания музыки", "Join the Team to listen to music")}</span>
                </Link>
              </div>

              <div className="relative w-full h-[40px] group flex items-center justify-center">
                <div 
                  className="absolute inset-0 rounded-xl z-0 shadow-[0_0_15px_rgba(57,255,20,0.2)] transition-all duration-500 group-hover:shadow-[inset_0_0_20px_rgba(0,0,0,1)] pointer-events-none"
                  style={{
                    padding: '2px',
                    background: 'linear-gradient(to right, #000000, #FFDA09, #39FF14, #FFDA09, #000000)',
                    WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                    WebkitMaskComposite: 'xor',
                    maskComposite: 'exclude',
                  }}
                />
                <Link
                  href="/auth/register"
                  className="relative w-[calc(100%-6px)] h-[32px] z-10 flex items-center justify-center text-center rounded-lg bg-gradient-to-r from-black via-black to-[#3a3a3a] text-[#39FF14] text-[11px] font-bold uppercase tracking-wider transition-all duration-300 group-hover:scale-95 group-active:scale-90 group-hover:text-slate-300 px-3 overflow-hidden"
                >
                  <div className="absolute inset-0 w-full h-full pointer-events-none overflow-hidden rounded-md">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#39FF14]/40 to-transparent -translate-x-full group-hover:animate-shimmer" />
                  </div>
                  <span className="relative z-10 drop-shadow-[0_0_5px_rgba(57,255,20,0.5)]">{tr("Ижод маҳсулларини жойлаштириш ва сотиш", "Ijod mahsullarini joylashtirish va sotish", "Размещение и продажа творческих изысканий", "Publish and sell creative products")}</span>
                </Link>
              </div>
            </div>

          </div>

          <div className="w-full h-[240px] sm:h-[340px] lg:h-[380px] flex items-center justify-center py-1">
            <div 
              style={{ transform: `perspective(600px) rotateY(${rotation}deg)` }}
              className="w-[240px] sm:w-[340px] lg:w-[420px] h-full relative [transform-style:preserve-3d] transition-transform duration-700"
            >
              <div className="absolute inset-0 rounded-[1.5rem] sm:rounded-[2rem] border border-emerald-500/30 bg-gradient-to-tr from-slate-950/90 to-slate-900/60 backdrop-blur-2xl p-3 sm:p-4 shadow-[0_0_50px_rgba(16,185,129,0.2)] flex items-center justify-center overflow-hidden [backface-visibility:hidden]">
                <div className="absolute inset-0 bg-gradient-to-tr from-emerald-500/10 to-cyan-500/10 rounded-[1.5rem] sm:rounded-[2rem] filter blur-xl pointer-events-none" />
                <img 
                  src={imagesList[frontIdx]} 
                  alt="Slide Front" 
                  className="w-full h-full object-contain rounded-xl sm:rounded-2xl drop-shadow-[0_15px_30px_rgba(16,185,129,0.4)] relative z-10 scale-105"
                />
              </div>

              <div className="absolute inset-0 rounded-[1.5rem] sm:rounded-[2rem] border border-cyan-500/30 bg-gradient-to-tr from-slate-950/90 to-slate-900/60 backdrop-blur-2xl p-3 sm:p-4 shadow-[0_0_50px_rgba(6,182,212,0.2)] flex items-center justify-center overflow-hidden [transform:rotateY(180deg)] [backface-visibility:hidden]">
                <div className="absolute inset-0 bg-gradient-to-tr from-cyan-500/10 to-emerald-500/10 rounded-[1.5rem] sm:rounded-[2rem] filter blur-xl pointer-events-none" />
                <img 
                  src={imagesList[backIdx]} 
                  alt="Slide Back" 
                  className="w-full h-full object-contain rounded-xl sm:rounded-2xl drop-shadow-[0_15px_30px_rgba(6,182,212,0.4)] relative z-10 scale-110"
                />
              </div>
            </div>
          </div>

        </div>
      </main>

      <footer className="border-t border-white/5 bg-black py-2 text-center text-[11px] text-slate-600 tracking-wider w-full flex-shrink-0 mt-auto">
        <p>{tr("© 2026 Ўзбекистон овози. Барча ҳуқуқлар ҳимояланган.", "© 2026 O'zbekiston ovozi. Barcha huquqlar himoyalangan.", "© 2026 Голос Узбекистана. Все права защищены.", "© 2026 Uzbekistan Voice. All rights reserved.")}</p>
      </footer>

      <style jsx global>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .group-hover\:animate-shimmer {
          animation: shimmer 4.5s infinite ease-in-out;
        }
      `}</style>
    </div>
  );
}