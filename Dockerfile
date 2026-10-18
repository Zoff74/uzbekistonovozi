# Используем официальный образ Node.js 20
FROM node:20.11.0-slim

RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

# Пробрасываем ВСЕ ключи ImageKit и настройки на этап сборки
ENV MONGODB_URI="mongodb+srv://zoff74_db_user:OXVUzsAEZCp1IGc0@cluster0.xqcppys.mongodb.net/uzbekistonovozi?retryWrites=true&w=majority&appName=Cluster0"
ENV IMAGEKIT_URL_ENDPOINT="https://ik.imagekit.io/tyhsos05b"
ENV IMAGEKIT_PRIVATE_KEY="private_MBEycosMetKWm0iR0Z76GEBuxAo="
ENV NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT="https://ik.imagekit.io/tyhsos05b"
ENV NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY="public_lXDnUMqOBAULb13GxG64QR3DiIA="
ENV NEXT_PUBLIC_IMAGEKIT_FOLDER="uzbekistonovozi"
ENV NEXT_PUBLIC_BASE_URL="https://uzbekistonovozi.onrender.com"
ENV NEXT_PUBLIC_NEXTAUTH_URL="https://uzbekistonovozi.onrender.com"
ENV NEXTAUTH_URL="https://uzbekistonovozi.onrender.com"
ENV NEXTAUTH_SECRET="fd35h1gf6jfg6j4f616fg4k6g156fd6hjsh8"
ENV JWT_SECRET="fd35h1gf6jfg6j4f616fg4k6g156fd6hjsh8"

RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]