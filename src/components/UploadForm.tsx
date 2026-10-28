"use client";

// БЛОК - "UploadForm" src/components/UploadForm.tsx
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function UploadForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [title, setTitle] = useState<string>("");
  const [singer, setSinger] = useState<string>("");
  const [genre, setGenre] = useState<string>("Pop");
  const [downloadPrice, setDownloadPrice] = useState<number>(1000); // 👈 Минимальная стандартная цена за скачивание (1000 сум)
  const [status, setStatus] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  
  // Управление платежным режимом
  const [needsPayment, setNeedsPayment] = useState<boolean>(false);
  const paymentAmount = process.env.NEXT_PUBLIC_PRICE_INITIAL_FEE || 10000;
  const cardNumber = process.env.NEXT_PUBLIC_PAYMENT_CARD_NUMBER || "5614 6816 0791 5026";
  const cardHolder = process.env.NEXT_PUBLIC_PAYMENT_CARD_HOLDER || "ZOFF74 ADMIN";

  async function handleUpload(e: React.FormEvent, isPaidOverride = false) {
    e.preventDefault();
    if (!file || !title || !singer) return;

    try {
      setIsProcessing(true);
      setStatus("Отправка аудиофайла на сервер...");

      const uploadFormData = new FormData();
      uploadFormData.append("file", file);
      uploadFormData.append("type", "audio");

      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        body: uploadFormData, 
      });

      const uploadText = await uploadRes.text();
      let uploadData;
      try {
        uploadData = uploadText ? JSON.parse(uploadText) : {};
      } catch (err) {
        throw new Error(`Ошибка ответа сервера загрузки: ${uploadText || uploadRes.status}`);
      }

      if (!uploadRes.ok || !uploadData.success) {
        throw new Error(uploadData.error || "Не удалось загрузить аудиофайл на сервер");
      }

      const { fileId, url } = uploadData;

      setStatus("Сохранение трека в базу данных...");
      const trackFormData = new FormData();
      trackFormData.append("title", title);
      trackFormData.append("singer", singer);
      trackFormData.append("genre", genre);
      trackFormData.append("downloadPrice", String(downloadPrice)); // 👈 Передаем цену за скачивание для Revenue Share (50/50)
      trackFormData.append("audioUrl", url || fileId);
      
      if (isPaidOverride) {
        trackFormData.append("isPaid", "true");
        trackFormData.append("paymentId", `p2p_${Date.now()}`);
        if (receiptFile) {
          trackFormData.append("receipt", receiptFile);
        }
      }

      if (coverFile) {
        trackFormData.append("cover", coverFile);
      }

      const trackRes = await fetch("/api/tracks", {
        method: "POST",
        body: trackFormData,
      });

      if (trackRes.status === 402) {
        setNeedsPayment(true);
        setStatus("Бесплатный триал исчерпан. Пожалуйста, оплатите размещение.");
        setIsProcessing(false);
        return;
      }

      const trackText = await trackRes.text();
      let trackResult;
      try {
        trackResult = trackText ? JSON.parse(trackText) : {};
      } catch (err) {
        throw new Error(`Ошибка ответа базы треков: ${trackText || trackRes.status}`);
      }

      if (!trackRes.ok || !trackResult.success) {
        throw new Error(trackResult.message || trackResult.error || "Ошибка при сохранении трека в базу");
      }

      setStatus(
        isPaidOverride
          ? "Оплата отправлена на проверку! Трек успешно опубликован."
          : "Первый релиз опубликован! Вам доступен 24-часовой бесплатный период."
      );
      
      setFile(null);
      setCoverFile(null);
      setReceiptFile(null);
      setTitle("");
      setSinger("");
      setDownloadPrice(1000);
      setNeedsPayment(false);

      router.refresh();

    } catch (err: any) {
      console.error(err);
      setStatus(`Ошибка: ${err.message || "Не удалось обработать трек"}`);
    } finally {
      if (!needsPayment) {
        setIsProcessing(false);
      }
    }
  }

  const handleConfirmP2PPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiptFile) {
      alert("Пожалуйста, прикрепите фото или скриншот чека перевода!");
      return;
    }
    handleUpload(e, true);
  };

  return (
    <div className="p-6 max-w-lg mx-auto bg-white rounded-xl shadow-md space-y-4">
      <h2 className="text-xl font-bold text-gray-800">Загрузка трека на платформу</h2>
      
      {!needsPayment ? (
        <form onSubmit={(e) => handleUpload(e, false)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Название трека</label>
            <input
              type="text"
              required
              disabled={isProcessing}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Введите название..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Исполнитель</label>
            <input
              type="text"
              required
              disabled={isProcessing}
              value={singer}
              onChange={(e) => setSinger(e.target.value)}
              placeholder="Имя исполнителя..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Жанр</label>
              <select
                disabled={isProcessing}
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              >
                <option value="Pop">Pop</option>
                <option value="Estrada">Estrada</option>
                <option value="Traditional">Traditional</option>
                <option value="Instrumental">Instrumental</option>
                <option value="Dance">Dance</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Цена скачивания (сум)</label>
              <input
                type="number"
                min="1000"
                step="500"
                required
                disabled={isProcessing}
                value={downloadPrice}
                onChange={(e) => setDownloadPrice(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 font-semibold text-violet-700"
              />
              <span className="text-[11px] text-gray-500 mt-0.5 block">Мин: 1000 сум (50% ваши)</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Обложка трека</label>
            <input
              type="file"
              accept="image/*"
              disabled={isProcessing}
              onChange={(e) => setCoverFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-violet-50 file:text-violet-700 hover:file:bg-violet-100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Аудиофайл (MP3/WAV)</label>
            <input
              type="file"
              accept="audio/*"
              required
              disabled={isProcessing}
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-violet-50 file:text-violet-700 hover:file:bg-violet-100"
            />
          </div>

          <button
            type="submit"
            disabled={!file || !title || !singer || isProcessing}
            className="w-full py-2.5 px-4 bg-violet-600 text-white font-semibold rounded-lg shadow-md hover:bg-violet-700 disabled:opacity-50 cursor-pointer"
          >
            {isProcessing ? "Обработка трека..." : "Опубликовать трек"}
          </button>
        </form>
      ) : (
        <div className="p-5 bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-xl space-y-4">
          <div className="text-amber-900 font-bold text-lg text-center">💳 Оплата размещения трека</div>
          
          <div className="bg-white p-4 rounded-lg shadow-inner text-sm space-y-2 border border-amber-100">
            <div className="flex justify-between text-gray-600">
              <span>Сумма к оплате:</span>
              <span className="font-bold text-violet-700 text-base">{Number(paymentAmount).toLocaleString()} сум</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Карта Humo / Uzcard:</span>
              <span className="font-mono font-bold text-gray-900">{cardNumber}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Получатель:</span>
              <span className="font-semibold text-gray-800">{cardHolder}</span>
            </div>
          </div>

          <form onSubmit={handleConfirmP2PPayment} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                Прикрепите скриншот / фото чека
              </label>
              <input
                type="file"
                accept="image/*"
                required
                disabled={isProcessing}
                onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
                className="block w-full text-xs text-gray-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-amber-100 file:text-amber-800 hover:file:bg-amber-200"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={!receiptFile || isProcessing}
                className="flex-1 py-2.5 px-4 bg-emerald-600 text-white font-semibold rounded-lg shadow hover:bg-emerald-700 disabled:opacity-50 cursor-pointer text-sm"
              >
                {isProcessing ? "Загрузка..." : "Подтвердить оплату и отправить"}
              </button>
              <button
                type="button"
                onClick={() => setNeedsPayment(false)}
                className="py-2.5 px-4 bg-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-300 text-sm"
              >
                Отмена
              </button>
            </div>
          </form>
        </div>
      )}

      {status && (
        <p className={`text-sm text-center font-medium ${needsPayment ? "text-amber-700" : "text-gray-600"}`}>
          {status}
        </p>
      )}
    </div>
  );
}