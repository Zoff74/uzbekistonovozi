"use client";
// src/app/marketplace/page.tsx
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { ShoppingBag, Loader2, Store, Tag, ArrowRight } from "lucide-react";
import { getOptimizedImageUrl } from "@/lib/imagekit";
import { tr } from "@/utils/translate";

interface IProductItem {
  _id: string;
  title: string;
  seller: string;
  price: number;
  currency?: string;
  image: string;
  category: string;
}

export default function MarketplacePage() {
  const [products, setProducts] = useState<IProductItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/marketplace")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setProducts(data.products);
        }
      })
      .catch((err) => console.error("Ошибка загрузки маркетплейса:", err))
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
              {tr("«ЎЗБЕКИСТОН ОВОЗИ»", "«O'ZBEKISTON OVOZI»", "«УЗБЕКИСТОН ОВОЗИ»", "«UZBEKISTON OVOZI»")} — {tr("МАРКЕТПЛЕЙС", "MARKETPLEYS", "МАРКЕТПЛЕЙС", "MARKETPLACE")}
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
              <Store className="w-6 h-6 text-emerald-400" /> {tr("Мусиқий Маркетплейс", "Musiqiy Marketpleys", "Музыкальный маркетплейс", "Musical Marketplace")}
            </h1>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-32">
            <Loader2 className="w-10 h-10 text-emerald-400 animate-spin" />
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-20 text-slate-500 text-sm border border-white/5 rounded-3xl bg-slate-950/40">
            {tr("Ҳозирча товарлар ва хизматлар мавжуд эмас. Қўшинг!", "Hozircha tovarlar va xizmatlar mavjud emas. Qo'shing!", "Пока нет товаров и услуг. Добавьте!", "No products or services available yet. Add some!")}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {products.map((product) => (
              <div 
                key={product._id}
                className="group bg-gradient-to-b from-slate-900/50 to-slate-950/85 border border-white/5 hover:border-emerald-500/50 rounded-3xl p-4 transition-all duration-500 flex flex-col justify-between shadow-2xl hover:shadow-[0_0_30px_rgba(16,185,129,0.15)]"
              >
                <div>
                  {/* Картинка товара / бита */}
                  <div className="relative aspect-video sm:aspect-[4/3] rounded-2xl overflow-hidden bg-slate-900 mb-4 shadow-xl">
                    <img 
                      src={getOptimizedImageUrl(product.image, 600, 450, 75)} 
                      alt={product.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    
                    <div className="absolute top-3 right-3 px-3 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-[11px] font-bold text-emerald-400 flex items-center gap-1">
                      <Tag className="w-3 h-3" /> {product.category || tr("Бирлик", "Birlik", "Единица", "Unit")}
                    </div>
                  </div>

                  <h3 className="font-black text-lg text-white group-hover:text-emerald-400 transition truncate">{product.title}</h3>
                  <p className="text-sm text-slate-400 truncate mt-0.5">{product.seller}</p>
                </div>
                
                {/* Цена и кнопка действия */}
                <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-bold block">{tr("Нархи", "Narxi", "Цена", "Price")}</span>
                    <span className="text-emerald-400 font-black text-lg">
                      {product.price?.toLocaleString()} {product.currency || tr("сўм", "so'm", "сум", "uzs")}
                    </span>
                  </div>

                  <Link 
                    href={`/marketplace/${product._id}`} 
                    className="px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-slate-950 border border-emerald-500/30 rounded-xl font-bold text-xs transition flex items-center gap-1.5"
                  >
                    <ShoppingBag className="w-3.5 h-3.5" /> {tr("Сотиб олиш", "Sotib olish", "Купить", "Buy")} <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Футер */}
      <footer className="border-t border-white/5 bg-black py-12 text-center text-xs text-slate-600 tracking-wider">
        <p>{tr("© 2026 Ўзбекистон овози. Барча ҳуқуқлар ҳимояланган.", "© 2026 O'zbekiston ovozi. Barcha huquqlar himoyalangan.", "© 2026 Узбекистон овози. Все права защищены.", "© 2026 Uzbekiston ovozi. All rights reserved.")}</p>
      </footer>
    </div>
  );
}