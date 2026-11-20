# Используем официальный образ Node.js 20 на базе Debian-slim
FROM node:20.11.0-slim

WORKDIR /app

# 🛠️ Устанавливаем ffmpeg (включает ffprobe) и корневые SSL-сертификаты
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm ci

# Копируем весь проект (исключения задаются через .dockerignore)
COPY . .

# Публичные переменные для этапа сборки клиентского бандла Next.js
ENV NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT="https://ik.imagekit.io/tyhsos05b"
ENV NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY="public_lXDnUMqOBAULb13GxG64QR3DiIA="
ENV NEXT_PUBLIC_IMAGEKIT_FOLDER="uzbekistonovozi"
ENV NEXT_PUBLIC_BASE_URL="https://uzbekistonovozi.onrender.com"
ENV NEXT_PUBLIC_NEXTAUTH_URL="https://uzbekistonovozi.onrender.com"
ENV NEXT_PUBLIC_ADMIN_PHONE="+998994779608"
ENV NEXT_PUBLIC_ADMIN_TELEGRAM_USER="@zoff74"

# Принудительно удаляем старый кэш сборки перед компиляцией
RUN rm -rf .next

# Собираем проект заново
RUN npm run build

ENV NODE_ENV=production
ENV PORT=10000
EXPOSE 10000

CMD ["npm", "start"]