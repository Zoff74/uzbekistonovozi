"use client";
// src/components/UploadForm.tsx
import { useState } from "react";

export default function UploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [title, setTitle] = useState<string>("");
  const [singer, setSinger] = useState<string>("");
  const [genre, setGenre] = useState<string>("Pop");
  const [status, setStatus] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !title || !singer) return;

    try {
      setIsProcessing(true);
      setStatus("Отправка файла на сервер для быстрой оптимизации...");

      // Формируем FormData для отправки видео на сервер
      const uploadFormData = new FormData();
      uploadFormData.append("file", file);
      uploadFormData.append("type", "video");

      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        body: uploadFormData, 
      });

      const uploadData = await uploadRes.json();
      if (!uploadRes.ok || !uploadData.success) {
        throw new Error(uploadData.error || "Не удалось загрузить и сжать файл на сервере");
      }

      const { fileId, url } = uploadData;

      // Шаг 2. Сохраняем метаданные клипа и полученный fileId в MongoDB
      setStatus("Сохранение метаданных в базу...");
      const videoFormData = new FormData();
      videoFormData.append("title", title);
      videoFormData.append("singer", singer);
      videoFormData.append("genre", genre);
      videoFormData.append("videoFileId", fileId);
      videoFormData.append("videoUrl", url || "");
      
      if (coverFile) {
        videoFormData.append("cover", coverFile);
      }

      const videoRes = await fetch("/api/videos", {
        method: "POST",
        body: videoFormData,
      });

      const videoResult = await videoRes.json();
      if (!videoRes.ok || !videoResult.success) {
        throw new Error(videoResult.message || "Ошибка при сохранении видео в базу");
      }

      setStatus("Клип успешно обработан сервером, загружен в Telegram и сохранен!");
      setFile(null);
      setCoverFile(null);
      setTitle("");
      setSinger("");
    } catch (err: any) {
      console.error(err);
      setStatus(`Ошибка: ${err.message || "Не удалось обработать видео"}`);
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div className="p-6 max-w-lg mx-auto bg-white rounded-xl shadow-md space-y-4">
      <h2 className="text-xl font-bold text-gray-800">Загрузка клипа (Серверный FFmpeg)</h2>
      
      <form onSubmit={handleUpload} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Название клипа</label>
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

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Жанр</label>
          <select
            disabled={isProcessing}
            value={genre}
            onChange={(e) => setGenre(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          >
            <option value="Клип">Клип</option>
            <option value="Концерт">Концерт</option>
            <option value="Uzbek Estrada">Uzbek Estrada</option>
            <option value="Pop">Pop</option>
            <option value="Dance">Dance</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Обложка (заставка)</label>
          <input
            type="file"
            accept="image/*"
            disabled={isProcessing}
            onChange={(e) => setCoverFile(e.target.files?.[0] || null)}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-violet-50 file:text-violet-700 hover:file:bg-violet-100"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Видеофайл</label>
          <input
            type="file"
            accept="video/*"
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
          {isProcessing ? "Сервер обрабатывает файл..." : "Загрузить и сжать клип"}
        </button>
      </form>

      {status && (
        <p className="text-sm text-center text-gray-600 font-medium">{status}</p>
      )}
    </div>
  );
}