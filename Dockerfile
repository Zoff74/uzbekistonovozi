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

# Сбидим Next.js приложение для продакшена
RUN npm run build

# Указываем порт и команду для запуска
EXPOSE 3000
CMD ["npm", "start"]