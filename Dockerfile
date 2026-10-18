# Используем официальный образ Node.js
FROM node:18-slim

# Устанавливаем системный ffmpeg прямо внутри контейнера
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

# Устанавливаем рабочую директорию
WORKDIR /app

# Копируем файлы зависимостей
COPY package.json package-lock.json* ./

# Устанавливаем зависимости
RUN npm ci

# Копируем весь остальной код проекта
COPY . .

# Пробрасываем переменные окружения внутрь контейнера для этапа сборки
ENV MONGODB_URI="mongodb+srv://zoff74_db_user:OXVUzsAEZCp1IGc0@cluster0.xqcppys.mongodb.net/uzbekistonovozi?retryWrites=true&w=majority&appName=Cluster0"
ENV NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY="public_lXDnUMqOBAULb13GxG64QR3DiIA="
ENV NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT="https://ik.imagekit.io/tyhsos05b"
ENV NEXT_PUBLIC_BASE_URL="https://uzbekistonovozi.onrender.com"
ENV NEXT_PUBLIC_NEXTAUTH_URL="https://uzbekistonovozi.onrender.com"
ENV NEXTAUTH_URL="https://uzbekistonovozi.onrender.com"

# Сбидим Next.js приложение для продакшена
RUN npm run build

# Указываем порт и команду для запуска
EXPOSE 3000
CMD ["npm", "start"]