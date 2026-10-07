"use client";

// src/components/BackButton.tsx
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { tr } from '@/utils/translate';

export default function BackButton() {
  const router = useRouter();

  const handleBack = () => {
    if (typeof window !== 'undefined') {
      // Проверяем, есть ли реальная история в рамках сессии роутера/браузера 
      // и не является ли текущая страница точкой входа (когда history.length <= 2)
      if (window.history.length > 2) {
        window.history.back();
      } else {
        // Если пользователь зашел по прямой ссылке, возвращаем его на главную,
        // чтобы он не завис на пустом экране
        router.push('/');
      }
    }
  };

  return (
    <Button
      type="button"
      variant="link"
      onClick={handleBack}
      className="text-[#FFDA09] hover:text-[#39FF14] font-bold text-sm tracking-wide transition-colors duration-300 p-0 h-auto underline underline-offset-4 cursor-pointer"
    >
      {tr("ОРҚАГА ҚАЙТИШ", "ORQAGA QAYTISH", "НАЗАД", "BACK")}
    </Button>
  );
}