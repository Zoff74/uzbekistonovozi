"use client";
//src\app\dashboard\tracks\[id]\edit\page.tsx
import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { uploadImage } from "@/actions/image.action";
import { tr } from "@/utils/translate";
import { Music, Image as ImageIcon, Loader2 } from "lucide-react";

export default function EditTrackPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id;

  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [saving, setSaving] = useState(false);
  const [freezing, setFreezing] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    title: "",
    singer: "",
    genre: "Pop",
    description: "",
    cover: "",
    audioUrl: "",
  });

  const [audioFileId, setAudioFileId] = useState<string | null>(null);

  const [trackMeta, setTrackMeta] = useState({
    createdAt: null as string | null,
    expiresAt: null as string | null,
    status: "ACTIVE",
  });

  const [canReplaceAudio, setCanReplaceAudio] = useState(true);
  const [timeLeftText, setTimeLeftText] = useState("");

  useEffect(() => {
    if (!id) return;

    fetch(`/api/tracks/${id}`)
      .then(async (res) => {
        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          throw new Error(tr("Сервер хатоси:", "Server xatosi:", "Ошибка сервера:", "Server error:") + ` ${res.status} ${res.statusText}`);
        }
        return res.json();
      })
      .then((data) => {
        const currentTrack = data.track || data.data || data;

        if (currentTrack && (currentTrack._id || currentTrack.id)) {
          setFormData({
            title: currentTrack.title || "",
            singer: currentTrack.singer || "",
            genre: currentTrack.genre || "Pop",
            description: currentTrack.description || "",
            cover: currentTrack.cover || "",
            audioUrl: currentTrack.audioUrl || "",
          });

          setAudioFileId(currentTrack.audioFileId || currentTrack.fileId || null);

          setTrackMeta({
            createdAt: currentTrack.createdAt,
            expiresAt: currentTrack.expiresAt,
            status: currentTrack.status || "ACTIVE",
          });

          if (currentTrack.createdAt) {
            const createdTime = new Date(currentTrack.createdAt).getTime();
            const now = new Date().getTime();
            const twentyFourHoursMs = 24 * 60 * 60 * 1000;
            const deadline = createdTime + twentyFourHoursMs;
            const diffMs = deadline - now;

            if (diffMs <= 0) {
              setCanReplaceAudio(false);
            } else {
              setCanReplaceAudio(true);
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
          setError(tr("Трек топилмади", "Trek topilmadi", "Трек не найден", "Track not found"));
        }
      })
      .catch((err: unknown) => {
        const errorMessage = err instanceof Error ? err.message : tr("Маълумотларни юклашда хатолик", "Ma'lumotlarni yuklashda xatolik", "Ошибка загрузки данных", "Error loading data");
        setError(errorMessage);
      })
      .finally(() => setFetching(false));
  }, [id]);

  const handleDeleteAudioFile = async () => {
    if (!audioFileId) {
      alert(tr("У бу трекда ImageKit файл идентификатори (fileId) йўқ.", "Bu trekda ImageKit fayl identifikatori (fileId) yo'q.", "У этого трека нет идентификатора файла (fileId) в ImageKit.", "This track has no fileId in ImageKit."));
      return;
    }

    if (!confirm(tr("Ҳақиқатан ҳам бу аудиофақилни ўчирмоқчимисиз?", "Haqiqatan ham bu audiofaylni o'chirmoqchimisiz?", "Вы действительно хотите удалить этот аудиофайл?", "Do you really want to delete this audio file?"))) return;

    try {
      const res = await fetch(`/api/upload?fileId=${audioFileId}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (res.ok && data.success) {
        alert(tr("Аудиофайл муваффақиятли ўчирилди!", "Audiofayl muvaffaqiyatli o'chirildi!", "Аудиофайл успешно удален!", "Audio file successfully deleted!"));
        setFormData((prev) => ({ ...prev, audioUrl: "" }));
        setAudioFileId(null);
      } else {
        alert(data.error || tr("Хатолик юз берди", "Xatolik yuz berdi", "Произошла ошибка", "An error occurred"));
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : tr("Хатолик юз берди", "Xatolik yuz berdi", "Произошла ошибка", "An error occurred");
      alert(errorMessage);
    }
  };

  const handleToggleFreeze = async () => {
    const newStatus = trackMeta.status === 'FROZEN' ? 'ACTIVE' : 'FROZEN';
    const confirmMessage = newStatus === 'FROZEN'
      ? tr("Трекни вақтинча музлатиб қўймоқчимисиз? У сайтдан яширилади.", "Trekni vaqtincha muzlatib qo'ymoqchimisiz? U saytdan yashiriladi.", "Хотите временно заморозить трек? Он будет скрыт с сайта.", "Do you want to temporarily freeze the track? It will be hidden from the site.")
      : tr("Тўлов қилиндими? Трекни фаоллаштириш вақти келди.", "To'lov qilindimi? Trekni faollashtirish vaqti keldi.", "Оплата произведена? Время активировать трек.", "Payment completed? Time to activate the track.");

    if (!confirm(confirmMessage)) return;

    setFreezing(true);
    try {
      const res = await fetch(`/api/tracks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      const data = await res.json();
      if (res.ok) {
        setTrackMeta((prev) => ({ ...prev, status: newStatus }));
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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, fieldName: 'cover' | 'audioUrl') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (fieldName === 'cover') setUploadingCover(true);
    if (fieldName === 'audioUrl') setUploadingAudio(true);
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

        // If replacing audio, also update the audioFileId if returned by uploadImage or handle via API. 
        // For now, update the form field and clear/update state as appropriate.
        setFormData((prev) => ({
          ...prev,
          [fieldName]: res.url!,
        }));
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : tr("Файлни юклашда хатолик", "Faylni yuklashda xatolik", "Ошибка загрузки файла", "Error uploading file");
        setError(errorMessage);
      } finally {
        if (fieldName === 'cover') setUploadingCover(false);
        if (fieldName === 'audioUrl') setUploadingAudio(false);
        e.target.value = "";
      }
    };

    reader.onerror = () => {
      setError(tr("Файлни ўқишда хатолик", "Faylni o'qishda xatolik", "Ошибка чтения файла", "Error reading file"));
      if (fieldName === 'cover') setUploadingCover(false);
      if (fieldName === 'audioUrl') setUploadingAudio(false);
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const payload = { ...formData };

      const res = await fetch(`/api/tracks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const textResponse = await res.text();
        console.error("Non-JSON server response:", textResponse);
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

  const isLocked = saving || uploadingCover || uploadingAudio || freezing;

  const GradientBorder = ({ intensity = "0.2" }) => (
    <div 
      className={`absolute inset-0 rounded-xl z-0 shadow-[0_0_20px_rgba(57,255,20,${intensity})] pointer-events-none transition-all duration-500`}
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
        <div>
          <div className={`relative rounded-xl inline-block group ${isLocked ? "opacity-50 pointer-events-none cursor-not-allowed" : ""}`}>
            <Link
              href="/dashboard"
              aria-disabled={isLocked}
              className="relative z-10 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-neutral-400 hover:text-white text-sm bg-neutral-950 transition"
            >
              <span>← {tr("Шахсий кабинетга қайтиш", "Shaxsiy kabinetga qaytish", "Вернуться в личный кабинет", "Back to dashboard")}</span>
            </Link>
            <GradientBorder intensity="0.15" />
          </div>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 md:p-10 shadow-xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-lg sm:text-xl text-amber-400 mb-1">{tr("Трекни таҳрирлаш", "Trekni tahrirlash", "Редактировать трек", "Edit Track")}</h1>
              <p className="text-sm text-neutral-400">{tr("Музыка ва маълумотларни янгилаш қоидаларини бошқариш", "Musiqa va ma'lumotlarni yangilash qoidalarini boshqarish", "Управление правилами обновления музыки и данных", "Manage music and data update rules")}</p>
            </div>

            <div className={`relative rounded-xl inline-block group ${isLocked ? 'opacity-50 pointer-events-none' : ''}`}>
              <button
                type="button"
                disabled={isLocked}
                onClick={handleToggleFreeze}
                className={`relative z-10 w-full px-4 py-2.5 rounded-xl text-xs font-semibold transition bg-neutral-950 flex items-center gap-1.5 justify-center cursor-pointer ${
                  trackMeta.status === 'FROZEN' ? 'text-blue-400' : 'text-amber-400'
                }`}
              >
                <span>
                  {trackMeta.status === 'FROZEN' ? 
                    `💳 ${tr("Тўлов қилиш ва фаоллаштириш", "To'lov qilish va faollashtirish", "Оплатить и разморозить", "Pay & Unfreeze")}` : 
                    `❄️ ${tr("Вақтинча музлатиш (Заморозка)", "Vaqtincha muzlatish (Zamorozka)", "Временно заморозить", "Freeze Track")}`
                  }
                </span>
              </button>
              <GradientBorder intensity="0.2" />
            </div>
          </div>
          
          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-2">{tr("Трек номи", "Trek nomi", "Название трека", "Track Title")}</label>
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
                <option value="Maqom">{tr("Мақом (Maqom)", "Maqom (Maqom)", "Мақом (Maqom)", "Maqom")}</option>
                <option value="Opera">{tr("Опера / Академический вокал (Opera)", "Opera / Akademik vokal (Opera)", "Опера / Академический вокал (Opera)", "Opera")}</option>
                <option value="Uzbek Estrada">{tr("Ўзбек эстрадаси (Uzbek Estrada)", "O'zbek estradasi (Uzbek Estrada)", "Узбекская эстрада (Uzbek Estrada)", "Uzbek Estrada")}</option>
                <option value="Milliy">{tr("Миллий / Фолльклор (Milliy)", "Milliy / Folklore (Milliy)", "Национальный / Фольклор (Milliy)", "Milliy")}</option>
                <option value="Uzbek Rap">{tr("Ўзбек рэпи (Uzbek Rap)", "O'zbek rapi (Uzbek Rap)", "Узбекский рэп (Uzbek Rap)", "Uzbek Rap")}</option>
                <option value="Pop">{tr("Поп (Pop)", "Pop (Pop)", "Поп (Pop)", "Pop")}</option>
                <option value="Jazz">{tr("Джаз (Jazz)", "Jazz (Jazz)", "Джаз (Jazz)", "Jazz")}</option>
                <option value="Blues">{tr("Блюз (Blues)", "Blues (Blues)", "Блюз (Blues)", "Blues")}</option>
                <option value="Soul / Funk">{tr("Соул / Фанк (Soul / Funk)", "Soul / Funk (Soul / Funk)", "Соул / Фанк (Soul / Funk)", "Soul / Funk")}</option>
                <option value="Dance">{tr("Ракбоп / Клубный (Dance)", "Raqs / Klubniy (Dance)", "Танцевальная / Клубная (Dance)", "Dance")}</option>
                <option value="Hip-Hop">{tr("Хип-хоп (Hip-Hop)", "Xip-xop (Hip-Hop)", "Хип-хоп (Hip-Hop)", "Hip-Hop")}</option>
                <option value="R&B">R&B</option>
                <option value="Rock">{tr("Рок (Rock)", "Rok (Rock)", "Рок (Rock)", "Rock")}</option>
                <option value="Indie">{tr("Инди (Indie)", "Indie (Indie)", "Инди (Indie)", "Indie")}</option>
                <option value="Electronic">{tr("Электронная музыка (Electronic)", "Elektron musiqa (Electronic)", "Электронная музыка (Electronic)", "Electronic")}</option>
                <option value="Lo-Fi">Lo-Fi</option>
                <option value="Classical">{tr("Классика (Classical)", "Klassika (Classical)", "Классика (Classical)", "Classical")}</option>
                <option value="Soundtrack">{tr("Саундтрек (Soundtrack)", "Soundtrack (Soundtrack)", "Саундтрек (Soundtrack)", "Soundtrack")}</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-2">{tr("Тавсиф ёки қўшиқ матни (Description / Lyrics)", "Tavsif yoki qo'shiq matni (Description / Lyrics)", "Описание или текст песни (Description / Lyrics)", "Description / Lyrics")}</label>
              <textarea
                rows={4}
                disabled={isLocked}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder={tr("Қўшиқ матни ёки релиз ҳақида қисқача...", "Qo'shiq matni yoki reliz haqida qisqacha...", "Текст песни или кратко о релизе...", "Song lyrics or short description about release...")}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-4 text-white text-sm focus:outline-none focus:border-amber-500 transition resize-none disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-2">
                {uploadingCover ? tr("Муқова юкланмоқда...", "Muqova yuklanmoqda...", "Обложка загружается...", "Uploading cover...") : tr("Муқова расми (Янги расмни юклаш)", "Muqova rasmi (Yangi rasmni yuklash)", "Изображение обложки (Загрузить новое фото)", "Cover Image (Upload new image)")}
              </label>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 relative rounded-2xl bg-neutral-950 overflow-hidden flex items-center justify-center shrink-0">
                  {formData.cover ? (
                    <img src={formData.cover} alt="Cover preview" className="absolute inset-0 w-full h-full object-cover z-10" />
                  ) : (
                    <ImageIcon className="w-6 h-6 text-neutral-600 z-10" />
                  )}
                  <GradientBorder intensity="0.2" />
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
                  <GradientBorder intensity="0.2" />
                </div>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-neutral-950 border border-neutral-800 space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-neutral-300">
                  {uploadingAudio ? tr("Аудиофайл юкланмоқда...", "Audiofayl yuklanmoqda...", "Аудиофайл загружается...", "Uploading audio file...") : tr("Аудиофайл (Янги трекка алмаштириш)", "Audiofayl (Yangi trekka almashtirish)", "Аудиофайл (Заменить новым треком)", "Audio file (Replace with new track)")}
                </label>

                {formData.audioUrl && audioFileId && (
                  <div className="relative rounded-xl inline-block group">
                    <button
                      type="button"
                      onClick={handleDeleteAudioFile}
                      className="relative z-10 text-xs text-red-400 hover:text-red-300 bg-neutral-950 px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>🗑️ {tr("Файлни ўчириш", "Faylni o'chirish", "Удалить файл", "Delete file")}</span>
                    </button>
                    <div 
                      className="absolute inset-0 rounded-xl z-0 shadow-[0_0_15px_rgba(239,68,68,0.3)] pointer-events-none transition-all duration-500"
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

              {canReplaceAudio ? (
                <div className="relative rounded-xl">
                  <div className={`relative rounded-xl overflow-hidden group ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    <label className="relative z-10 flex flex-col items-center justify-center w-full h-24 rounded-xl bg-neutral-950 cursor-pointer transition">
                      <div className="flex items-center gap-2 text-xs text-neutral-300 px-4 text-center">
                        <Music className="w-5 h-5 text-amber-400 shrink-0" />
                        <span>{tr("Янги аудиофайл танлаш учун босинг", "Yangi audiofayl tanlash uchun bosing", "Нажмите, чтобы выбрать новый аудиофайл", "Click to select new audio file")}</span>
                      </div>
                      <input
                        type="file"
                        accept="audio/*"
                        disabled={isLocked}
                        onChange={(e) => handleFileChange(e, 'audioUrl')}
                        className="hidden"
                      />
                    </label>
                    <GradientBorder intensity="0.2" />
                  </div>
                  <p className="text-xs text-amber-400 mt-2">
                    ⚠️ {tr(`Файлни алмаштириш учун ${timeLeftText} вақт қолди.`, `Faylni almashtirish uchun ${timeLeftText} vaqt qoldi.`, `Осталось ${timeLeftText} для замены файла.`, `${timeLeftText} left to replace the file.`)}
                  </p>
                </div>
              ) : (
                <div className="text-xs text-neutral-400 space-y-1">
                  <p className="text-red-400 font-medium">❌ {tr("Аудиофайлга ўзгартиришлар киритиш муддати тугади ( 24 соат ).", "Audiofaylga o'zgartirishlar kiritish muddati tugadi ( 24 soat ).", "Срок внесения изменений в аудиофайл истек ( 24 часа ).", "The deadline to modify the audio file has expired ( 24 hours ).")}</p>
                  <p>{tr("Энди файлни ўзгартириб бўлмайди. 10 кунлик БЕПУЛ БОНУС трек ҳисоблаш муддати бошланди.", "Endi faylni o'zgartirib bo'lmaydi. 10 kunlik BEPUL BONUS trek hisoblash muddati boshlandi.", "Теперь файл изменить нельзя. Начался 10-дневный период бесплатного бонусного отсчета трека.", "The file can no longer be changed. The 10-day free bonus track counting period has started.")}</p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-neutral-800 text-xs text-neutral-400">
              <div className="bg-neutral-950 p-3 rounded-xl border border-neutral-800">
                <span className="block text-neutral-500">{tr("Ҳолати (Status)", "Holati (Status)", "Состояние (Status)", "Status")}</span>
                <span className={`font-semibold mt-0.5 block ${trackMeta.status === 'ACTIVE' ? 'text-emerald-400' : trackMeta.status === 'FROZEN' ? 'text-blue-400' : 'text-red-400'}`}>
                  {trackMeta.status === 'ACTIVE' ? tr("Фаол (Бонус даври)", "Faol (Bonus davri)", "Активный (Бонусный период)", "Active (Bonus period)") : 
                   trackMeta.status === 'FROZEN' ? tr("Музlatilgan (Заморозка / Оплата кутиляпти)", "Muzlatilgan (Zamorozka / To'lov kutilayotgan)", "Заморожен (Ожидает оплаты)", "Frozen / Awaiting Payment") : 
                   tr("Муддати тугаган", "Muddati tugagan", "Срок истек", "Expired")}
                </span>
              </div>
              <div className="bg-neutral-950 p-3 rounded-xl border border-neutral-800">
                <span className="block text-neutral-500">{tr("Якунланиш санаси", "Yakunlanish sanasi", "Дата окончания", "Expiration date")}</span>
                <span className="font-semibold mt-0.5 block text-white">
                  {trackMeta.expiresAt ? new Date(trackMeta.expiresAt).toLocaleDateString() : tr("Белгиланмаган", "Belgilanmagan", "Не указано", "Not specified")}
                </span>
              </div>
            </div>

            <div className="pt-4 flex items-center justify-end gap-4">
              <div className={`relative rounded-xl inline-block group ${isLocked ? "opacity-50 pointer-events-none cursor-not-allowed" : ""}`}>
                <Link
                  href="/dashboard"
                  aria-disabled={isLocked}
                  className="relative z-10 px-6 py-2.5 rounded-xl bg-neutral-950 text-neutral-400 hover:text-white transition text-sm inline-block"
                >
                  <span>{tr("Орқага", "Orqaga", "Отмена", "Cancel")}</span>
                </Link>
                <GradientBorder intensity="0.15" />
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
                <GradientBorder intensity="0.3" />
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}