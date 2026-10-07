"use client";

//src\app\dashboard\videos\[id]\edit\page.tsx

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { uploadImage } from "@/actions/image.action";
import { tr } from "@/utils/translate";
import { Film, Image as ImageIcon, Loader2, Trash2 } from "lucide-react";

export default function EditVideoPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id;

  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [freezing, setFreezing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    title: "",
    singer: "",
    genre: "Pop",
    description: "",
    cover: "",
    videoUrl: "",
  });

  const [videoFileId, setVideoFileId] = useState<string | null>(null);

  const [videoMeta, setVideoMeta] = useState({
    createdAt: null as string | null,
    expiresAt: null as string | null,
    status: "ACTIVE", // ACTIVE, FROZEN, EXPIRED
  });

  const [canReplaceVideo, setCanReplaceVideo] = useState(true);
  const [timeLeftText, setTimeLeftText] = useState("");

  // Загружаем данные видео
  useEffect(() => {
    if (!id) return;

    fetch(`/api/videos/${id}`)
      .then(async (res) => {
        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          throw new Error(tr("Сервер хатоси:", "Server xatosi:", "Ошибка сервера:", "Server error:") + ` ${res.status} ${res.statusText}`);
        }
        return res.json();
      })
      .then((data) => {
        const currentVideo = data.video || data.data || data;

        if (currentVideo && (currentVideo._id || currentVideo.id)) {
          setFormData({
            title: currentVideo.title || "",
            singer: currentVideo.singer || "",
            genre: currentVideo.genre || "Pop",
            description: currentVideo.description || "",
            cover: currentVideo.cover || "",
            videoUrl: currentVideo.videoUrl || "",
          });

          setVideoFileId(currentVideo.videoFileId || currentVideo.fileId || null);

          setVideoMeta({
            createdAt: currentVideo.createdAt,
            expiresAt: currentVideo.expiresAt,
            status: currentVideo.status || "ACTIVE",
          });

          if (currentVideo.createdAt) {
            const createdTime = new Date(currentVideo.createdAt).getTime();
            const now = new Date().getTime();
            const twentyFourHoursMs = 24 * 60 * 60 * 1000;
            const deadline = createdTime + twentyFourHoursMs;
            const diffMs = deadline - now;

            if (diffMs <= 0) {
              setCanReplaceVideo(false);
            } else {
              setCanReplaceVideo(true);
              const totalMinutes = Math.floor(diffMs / (1000 * 60));
              const hours = Math.floor(totalMinutes / 60);
              const minutes = totalMinutes % 60;

              if (hours > 0) {
                setTimeLeftText(`яна ${hours} соат ${minutes} дақиқа`);
              } else {
                setTimeLeftText(`яна ${minutes} дақиқа`);
              }
            }
          }
        } else {
          setError(tr("Видео топилмади", "Video topilmadi", "Видео не найдено", "Video not found"));
        }
      })
      .catch((err: unknown) => {
        const errorMessage = err instanceof Error ? err.message : tr("Маълумотларни юклашда хатолик", "Ma'lumotlarni yuklashda xatolik", "Ошибка загрузки данных", "Error loading data");
        setError(errorMessage);
      })
      .finally(() => setFetching(false));
  }, [id]);

  // Функция полного удаления видео из базы
  const handleDeleteVideo = async () => {
    if (!confirm(tr("Ҳақиқатан ҳам бу видеони ўчирмоқчимисиз?", "Haqiqatan ham bu videoni o'chirmoqchimisiz?", "Вы действительно хотите удалить это видео?", "Do you really want to delete this video?"))) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/videos/${id}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (res.ok) {
        alert(tr("Видео муваффақиятли ўчирилди!", "Video muvaffaqiyatli o'chirildi!", "Видео успешно удалено!", "Video successfully deleted!"));
        router.push("/dashboard");
        router.refresh();
      } else {
        alert(data.error || tr("Хатолик юз берди", "Xatolik yuz berdi", "Произошла ошибка", "An error occurred"));
        setDeleting(false);
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : tr("Хатолик юз берди", "Xatolik yuz berdi", "Произошла ошибка", "An error occurred");
      alert(errorMessage);
      setDeleting(false);
    }
  };

  // Функция удаления видеофайла из ImageKit
  const handleDeleteVideoFile = async () => {
    if (!videoFileId) {
      alert(tr("У этого видео нет идентификатора файла (fileId) в ImageKit.", "Bu videoda ImageKit fayl identifikatori (fileId) yo'q.", "У этого видео нет идентификатора файла (fileId) в ImageKit.", "This video has no fileId in ImageKit."));
      return;
    }

    if (!confirm(tr("Ҳақиқатан ҳам бу видеони ўчирмоқчимисиз?", "Haqiqatan ham bu videoni o'chirmoqchimisiz?", "Вы действительно хотите удалить этот видеофайл?", "Do you really want to delete this video file?"))) return;

    try {
      const res = await fetch(`/api/upload?fileId=${videoFileId}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (res.ok && data.success) {
        alert(tr("Видеофайл муваффақиятли ўчирилди!", "Videofayl muvaffaqiyatli o'chirildi!", "Видеофайл успешно удален!", "Video file successfully deleted!"));
        setFormData(prev => ({ ...prev, videoUrl: "" }));
        setVideoFileId(null);
      } else {
        alert(data.error || tr("Хатолик юз берди", "Xatolik yuz berdi", "Произошла ошибка", "An error occurred"));
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : tr("Хатолик юз берди", "Xatolik yuz berdi", "Произошла ошибка", "An error occurred");
      alert(errorMessage);
    }
  };

  // Функция заморозки / разморозки видео
  const handleToggleFreeze = async () => {
    const newStatus = videoMeta.status === 'FROZEN' ? 'ACTIVE' : 'FROZEN';
    const confirmMessage = newStatus === 'FROZEN'
      ? tr("Видеоклипни вақтинча музлатиб қўймоқчимисиз? У сайтдан яширилади.", "Videoklipni vaqtincha muzlatib qo'ymoqchimisiz? U saytdan yashiriladi.", "Хотите временно заморозить клип? Он будет скрыт с сайта.", "Do you want to temporarily freeze the video clip? It will be hidden from the site.")
      : tr("Тўлов қилиндими? Видеоклипни фаоллаштириш вақти келди.", "To'lov qilindimi? Videoklipni faollashtirish vaqti keldi.", "Оплата произведена? Время активировать клип.", "Payment completed? Time to activate the video clip.");

    if (!confirm(confirmMessage)) return;

    setFreezing(true);
    try {
      const res = await fetch(`/api/videos/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      const data = await res.json();
      if (res.ok) {
        setVideoMeta(prev => ({ ...prev, status: newStatus }));
        alert(tr("Ҳолат муваффақиятли ўзгарди!", "Holat muvaffaqiyatli o'zgardi!", "Статус успешно изменен!", "Status updated successfully!"));
      } else {
        alert(data.error || tr("Хатолик юз берди", "Xatolik yuz berdi", "Произошла ошибка", "An error occurred"));
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : tr("Хатолик юз берди", "Xatolik yuz berdi", "Произошла ошибка", "An error occurred");
      alert(errorMessage);
    } finally {
      setFreezing(false);
    }
  };

  // Загрузка файлов (обложка или видео)
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, fieldName: 'cover' | 'videoUrl') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (fieldName === 'cover') setUploadingCover(true);
    if (fieldName === 'videoUrl') setUploadingVideo(true);
    setError(null);

    const reader = new FileReader();
    reader.readAsDataURL(file);
    
    reader.onload = async () => {
      try {
        const base64String = reader.result as string;
        const res = await uploadImage(base64String, file.name, 'post');

        if (!res.success || !res.url) {
          throw new Error(res.error || tr("Файлни юклаб бўлмади", "Faylni yuklab bo'lmadi", "Не удалось загрузить файл", "Failed to upload file"));
        }

        setFormData((prev) => ({
          ...prev,
          [fieldName]: res.url!,
        }));
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : tr("Файлни юклашда хатолик", "Faylni yuklashda xatolik", "Ошибка загрузки файла", "Error uploading file");
        setError(errorMessage);
      } finally {
        if (fieldName === 'cover') setUploadingCover(false);
        if (fieldName === 'videoUrl') setUploadingVideo(false);
        e.target.value = "";
      }
    };

    reader.onerror = () => {
      setError(tr("Файлни ўқишда хатолик", "Faylni o'qishda xatolik", "Ошибка чтения файла", "Error reading file"));
      if (fieldName === 'cover') setUploadingCover(false);
      if (fieldName === 'videoUrl') setUploadingVideo(false);
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const payload = {
        ...formData,
        ...(!canReplaceVideo && { videoUrl: undefined }),
      };

      const res = await fetch(`/api/videos/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error(tr("Сақлаш вақтида сервердан нотўғри жавоб келди.", "Saqlash vaqtida serverdan noto'g'ri javob keldi.", "При сохранении пришел неверный ответ от сервера.", "Invalid server response during save."));
      }

      const responseData = await res.json();

      if (!res.ok) {
        throw new Error(responseData.error || responseData.message || tr("Хатолик юз берди", "Xatolik yuz berdi", "Произошла ошибка", "An error occurred"));
      }

      router.push("/dashboard");
      router.refresh();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : tr("Хатолик юз берди", "Xatolik yuz berdi", "Произошла ошибка", "An error occurred");
      setError(errorMessage);
      setSaving(false);
    }
  };

  if (fetching) {
    return <div className="min-h-screen bg-neutral-950 text-white p-12 text-center text-sm">{tr("Юкланмоқда...", "Yuklanmoqda...", "Загрузка...", "Loading...")}</div>;
  }

  const isLocked = saving || uploadingCover || uploadingVideo || freezing || deleting;

  const GradientBorder = () => (
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
  );

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-6 md:p-12 font-sans">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          {/* Кнопка 1: Назад */}
          <div className={`relative rounded-xl inline-block group ${isLocked ? "opacity-50 pointer-events-none cursor-not-allowed" : ""}`}>
            <Link
              href="/dashboard"
              aria-disabled={isLocked}
              className="relative z-10 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-neutral-400 hover:text-white text-sm bg-neutral-950 transition"
            >
              <span>← {tr("Шахсий кабинетга қайтиш", "Shaxsiy kabinetga qaytish", "Вернуться в личный кабинет", "Back to dashboard")}</span>
            </Link>
            <GradientBorder />
          </div>

          {/* Кнопка: Полное удаление видео */}
          <div className="relative rounded-xl inline-block group">
            <button
              type="button"
              disabled={isLocked}
              onClick={handleDeleteVideo}
              className="relative z-10 text-xs text-red-400 hover:text-red-300 bg-neutral-950 px-4 py-2.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              <span>{tr("Видеони ўчириш", "Videoni o'chirish", "Удалить видео", "Delete video")}</span>
            </button>
            <div 
              className="absolute inset-0 rounded-xl z-0 shadow-[0_0_15px_rgba(239,68,68,0.3)] transition-all duration-500 group-hover:shadow-[inset_0_0_20px_rgba(0,0,0,1)] pointer-events-none"
              style={{
                padding: '2px',
                background: 'linear-gradient(to right, #000000, #ef4444, #39FF14, #ef4444, #000000)',
                WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                WebkitMaskComposite: 'xor',
                maskComposite: 'exclude',
              }}
            />
          </div>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 md:p-10 shadow-xl space-y-6">
          <div>
            <h1 className="text-lg sm:text-xl text-amber-400 mb-1">{tr("Видеоклипни таҳрирлаш", "Videoklipni tahrirlash", "Редактировать клип", "Edit Video Clip")}</h1>
            <p className="text-sm text-neutral-400">{tr("Видео ва маълумотларни янгилаш қоидаларини бошқариш", "Video va ma'lumotlarni yangilash qoidalarini boshqarish", "Управление правилами обновления видео и данных", "Manage video and data update rules")}</p>
          </div>
          
          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-2">{tr("Видео номи", "Video nomi", "Название видео", "Video Title")}</label>
                <input
                  type="text"
                  required
                  disabled={isLocked}
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-amber-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-2">{tr("Ижрочи / Муаллиф", "Ijrochi / Muallif", "Исполнитель / Автор", "Singer / Author")}</label>
                <input
                  type="text"
                  required
                  disabled={isLocked}
                  value={formData.singer}
                  onChange={(e) => setFormData({ ...formData, singer: e.target.value })}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-amber-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-2">{tr("Жанр", "Janr", "Жанр", "Genre")}</label>
              <select
                value={formData.genre}
                disabled={isLocked}
                onChange={(e) => setFormData({ ...formData, genre: e.target.value })}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-amber-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="Клип">{tr("Клип (Clip)", "Klip (Clip)", "Клип (Clip)", "Clip")}</option>
                <option value="Концерт">{tr("Концерт (Live)", "Konsert (Live)", "Концерт (Live)", "Live Concert")}</option>
                <option value="Uzbek Estrada">{tr("Ўзбек эстрадаси", "O'zbek estradasi", "Узбекская эстрада", "Uzbek Estrada")}</option>
                <option value="Pop">Pop</option>
                <option value="Dance">Dance</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-2">{tr("Тавсиф (Description)", "Tavsif (Description)", "Описание (Description)", "Description")}</label>
              <textarea
                rows={4}
                disabled={isLocked}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder={tr("Видеоклип ҳақида қисқача...", "Videoklip haqida qisqacha...", "Кратко о видеоклипе...", "Short description about video clip...")}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-4 text-white text-sm focus:outline-none focus:border-amber-500 transition resize-none disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>

            {/* Загрузка обложки видео */}
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-2">
                {uploadingCover ? tr("Муқова юкланмоқда...", "Muqova yuklanmoqda...", "Обложка загружается...", "Uploading cover...") : tr("Муқова расми (Заставка)", "Muqova rasmi (Zastavka)", "Изображение обложки (Заставка)", "Cover Image")}
              </label>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 relative rounded-2xl bg-neutral-950 overflow-hidden flex items-center justify-center shrink-0 group">
                  {formData.cover ? (
                    <img src={formData.cover} alt="Cover preview" className="absolute inset-0 w-full h-full object-cover z-10" />
                  ) : (
                    <ImageIcon className="w-6 h-6 text-neutral-600 z-10" />
                  )}
                  <GradientBorder />
                </div>

                <div className={`relative rounded-xl inline-block group ${isLocked ? 'opacity-50 pointer-events-none' : ''}`}>
                  <label className="relative z-10 cursor-pointer bg-neutral-950 text-white text-xs font-semibold px-4 py-2.5 rounded-xl transition inline-block">
                    <span>{tr("Муқова танлаш", "Muqova tanlash", "Выбрать обложку", "Select cover")}</span>
                    <input
                      type="file"
                      accept="image/*"
                      disabled={isLocked}
                      className="hidden"
                      onChange={(e) => handleFileChange(e, 'cover')}
                    />
                  </label>
                  <GradientBorder />
                </div>
              </div>
            </div>

            {/* Видеофайл с защитой в 24 часа и кнопкой удаления */}
            <div className="p-4 rounded-2xl bg-neutral-950 border border-neutral-800 space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-neutral-300">
                  {uploadingVideo ? tr("Видеофайл юкланмоқда...", "Videofayl yuklanmoqda...", "Видеофайл загружается...", "Uploading video file...") : tr("Видеоклип файли (Янгисига алмаштириш)", "Videoklip fayli (Yangiiga almashtirish)", "Видеофайл (Заменить новым)", "Video File (Replace)")}
                </label>

                {formData.videoUrl && videoFileId && (
                  <div className="relative rounded-xl inline-block group">
                    <button
                      type="button"
                      disabled={isLocked}
                      onClick={handleDeleteVideoFile}
                      className="relative z-10 text-xs text-red-400 hover:text-red-300 bg-neutral-950 px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <span>🗑️ {tr("Файлни ўчириш", "Faylni o'chirish", "Удалить файл", "Delete file")}</span>
                    </button>
                    <div 
                      className="absolute inset-0 rounded-xl z-0 shadow-[0_0_15px_rgba(239,68,68,0.2)] transition-all duration-500 group-hover:shadow-[inset_0_0_20px_rgba(0,0,0,1)] pointer-events-none"
                      style={{
                        padding: '2px',
                        background: 'linear-gradient(to right, #000000, #ef4444, #39FF14, #ef4444, #000000)',
                        WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                        WebkitMaskComposite: 'xor',
                        maskComposite: 'exclude',
                      }}
                    />
                  </div>
                )}
              </div>

              {canReplaceVideo ? (
                <div className="relative rounded-xl">
                  <div className={`relative rounded-xl overflow-hidden group ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    <label className="relative z-10 flex flex-col items-center justify-center w-full h-24 rounded-xl bg-neutral-950 cursor-pointer transition">
                      <div className="flex items-center gap-2 text-xs text-neutral-300 px-4 text-center">
                        <Film className="w-5 h-5 text-amber-400 shrink-0" />
                        <span>{tr("Янги видеофайл танлаш учун босинг", "Yangi videofayl tanlash uchun bosing", "Нажмите, чтобы выбрать новый видеофайл", "Click to select new video file")}</span>
                      </div>
                      <input
                        type="file"
                        accept="video/*"
                        disabled={isLocked}
                        onChange={(e) => handleFileChange(e, 'videoUrl')}
                        className="hidden"
                      />
                    </label>
                    <GradientBorder />
                  </div>
                  <p className="text-xs text-amber-400 mt-2">
                    ⚠️ {tr(`Видео файлни алмаштириш учун ${timeLeftText} вақт қолди.`, `Video faylni almashtirish uchun ${timeLeftText} vaqt qoldi.`, `Осталось ${timeLeftText} для замены видеофайла.`, `${timeLeftText} left to replace the video file.`)}
                  </p>
                </div>
              ) : (
                <div className="text-xs text-neutral-400 space-y-1">
                  <p className="text-red-400 font-medium">❌ {tr("Видеофайлга ўзгартиришлар киритиш муддати тугади ( 24 соат ).", "Videofaylga o'zgartirishlar kiritish muddati tugadi ( 24 soat ).", "Срок внесения изменений в видеофайл истек ( 24 часа ).", "The deadline to modify the video file has expired ( 24 hours ).")}</p>
                  <p>{tr("Энди видеони ўзгартириб бўлмайди.", "Endi videoni o'zgartirib bo'lmaydi.", "Теперь видео изменить нельзя.", "The video can no longer be changed.")}</p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-neutral-800 text-xs text-neutral-400">
              <div className="bg-neutral-950 p-3 rounded-xl border border-neutral-800">
                <span className="block text-neutral-500">{tr("Ҳолати (Status)", "Holati (Status)", "Состояние (Status)", "Status")}</span>
                <span className={`font-semibold mt-0.5 block ${videoMeta.status === 'ACTIVE' ? 'text-emerald-400' : videoMeta.status === 'FROZEN' ? 'text-blue-400' : 'text-red-400'}`}>
                  {videoMeta.status === 'ACTIVE' ? tr("Фаол", "Faol", "Активный", "Active") : 
                   videoMeta.status === 'FROZEN' ? tr("Музlatilgan (Заморозка / Оплата кутиляпти)", "Muzlatilgan (Zamorozka / To'lov kutilayotgan)", "Заморожен (Ожидает оплаты)", "Frozen / Awaiting Payment") : 
                   tr("Муддати тугаган", "Muddati tugagan", "Срок истек", "Expired")}
                </span>
              </div>
              <div className="bg-neutral-950 p-3 rounded-xl border border-neutral-800">
                <span className="block text-neutral-500">{tr("Якунланиш санаси", "Yakunlanish sanasi", "Дата окончания", "Expiration date")}</span>
                <span className="font-semibold mt-0.5 block text-white">
                  {videoMeta.expiresAt ? new Date(videoMeta.expiresAt).toLocaleDateString() : tr("Белгиланмаган", "Belgilanmagan", "Не указано", "Not specified")}
                </span>
              </div>
            </div>

            {/* Нижняя панель с кнопками */}
            <div className="pt-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 border-t border-neutral-800">
              <div className={`relative rounded-xl inline-block group ${isLocked ? 'opacity-50 pointer-events-none' : ''}`}>
                <button
                  type="button"
                  disabled={isLocked}
                  onClick={handleToggleFreeze}
                  className={`relative z-10 w-full px-4 py-2.5 rounded-xl text-xs font-semibold transition bg-neutral-950 flex items-center gap-1.5 justify-center cursor-pointer ${
                    videoMeta.status === 'FROZEN' ? 'text-blue-400' : 'text-amber-400'
                  }`}
                >
                  <span>
                    {videoMeta.status === 'FROZEN' ? 
                      `💳 ${tr(" Тўлов қилиш ва отморозка қилиш", " To'lov qilish va otmorozka qilish", " Оплатить и разморозить", " Pay & Unfreeze")}` : 
                      `❄️ ${tr("Вақтинча музлатиш (Заморозка)", "Vaqtincha muzlatish (Zamorozka)", "Временно заморозить", "Freeze Video")}`
                    }
                  </span>
                </button>
                <GradientBorder />
              </div>

              <div className="flex items-center gap-3 justify-end">
                <div className={`relative rounded-xl inline-block group ${isLocked ? "opacity-50 pointer-events-none cursor-not-allowed" : ""}`}>
                  <Link
                    href="/dashboard"
                    aria-disabled={isLocked}
                    className="relative z-10 px-6 py-2.5 rounded-xl bg-neutral-950 text-neutral-400 hover:text-white transition text-sm inline-block text-center"
                  >
                    <span>{tr("Бекор қилиш", "Bekor qilish", "Отмена", "Cancel")}</span>
                  </Link>
                  <GradientBorder />
                </div>

                <div className="relative rounded-xl inline-block group">
                  <button
                    type="submit"
                    disabled={isLocked}
                    className="relative z-10 bg-neutral-950 text-amber-400 disabled:opacity-50 font-semibold px-6 py-2.5 rounded-xl transition cursor-pointer text-sm disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <span className="flex items-center gap-2">
                      {saving && <Loader2 className="animate-spin" size={16} />}
                      <span>{saving ? tr("Сақланмоқда...", "Saqlanmoqda...", "Сохранение...", "Saving...") : tr("Ўзгаришларни сақлаш", "O'zgarishlarni saqlash", "Сохранить изменения", "Save changes")}</span>
                    </span>
                  </button>
                  <GradientBorder />
                </div>
              </div>
            </div>

          </form>
        </div>
      </div>
    </div>
  );
}