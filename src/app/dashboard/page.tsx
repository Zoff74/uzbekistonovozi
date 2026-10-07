//src\app\dashboard\page.tsx
import { dbConnect } from "@/lib/mongoose";
import { Track } from "@/models/Track";
import { Video } from "@/models/Video";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth.config";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus, Film, Music, Settings } from "lucide-react";
import TrackCard from "@/components/TrackCard";
import VideoCard from "@/components/VideoCard";
import { Types } from "mongoose";
import { tr } from "@/utils/translate";

interface SessionUser {
    id?: string;
    name?: string | null;
    email?: string | null;
}

interface SessionData {
    user?: SessionUser;
}

export default async function DashboardPage() {
    const session = (await getServerSession(authOptions)) as SessionData | null;

    if (!session || !session.user || !session.user.id) {
        redirect("/auth/login");
    }

    await dbConnect();

    const userId = session.user.id;

    // Параллельный запрос треков и видеоклипов пользователя
    const [rawTracks, rawVideos] = await Promise.all([
        (Track as any).find({ authorId: userId }).sort({ createdAt: -1 }).lean(),
        (Video as any).find({ 
            $or: [
                { authorId: userId },
                { authorId: new Types.ObjectId(userId) }
            ]
        }).sort({ createdAt: -1 }).lean(),
    ]);

    // Сериализация документов Mongoose для клиентских компонентов
    const userTracks = rawTracks.map((track: any) => ({
        ...track,
        _id: track._id.toString(),
        authorId: track.authorId?.toString(),
    }));

    const userVideos = rawVideos.map((video: any) => ({
        ...video,
        _id: video._id.toString(),
        authorId: video.authorId?.toString(),
    }));

    return (
        <div className="min-h-screen bg-neutral-950 text-white p-4 sm:p-6 md:p-12 overflow-x-hidden font-sans">
            <div className="max-w-5xl mx-auto space-y-8">
                
                {/* Навигация (Назад) */}
                <div>
                    <div className="relative w-fit h-[42px] group flex items-center justify-center cursor-pointer">
                        <div className="absolute inset-0 bg-gradient-to-r from-black to-gray-600 rounded-lg z-0 shadow-[0_0_15px_rgba(57,255,20,0.15)] transition-all duration-500 group-hover:shadow-[inset_0_0_20px_rgba(0,0,0,1)]" />
                        <Link
                            href="/"
                            className="relative h-[34px] z-10 flex items-center gap-1.5 px-3 rounded-md border-[2px] border-transparent bg-clip-border text-[10px] font-bold uppercase tracking-wider bg-black text-[#39FF14] transition-all duration-300 overflow-hidden group-hover:scale-95 group-active:scale-90 group-hover:text-white whitespace-nowrap"
                            style={{ 
                                borderImageSource: 'linear-gradient(to right, #000000, #FFDA09, #39FF14, #FFDA09, #000000)', 
                                borderImageSlice: 1 
                            }}
                        >
                            <div className="absolute inset-0 w-full h-full pointer-events-none overflow-hidden">
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#39FF14]/40 to-transparent -translate-x-full group-hover:animate-shimmer" />
                            </div>
                            <ArrowLeft size={13} className="text-[#39FF14] relative z-10 shrink-0" />
                            <span className="relative z-10">{tr("Бош саҳифага", "Bosh sahifaga", "На главную", "Back to home")}</span>
                        </Link>
                    </div>
                </div>

                {/* Шапка кабинета и блок кнопок в один ряд */}
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 pb-6 border-b border-neutral-800">
                    <div>
                        <h1 className="text-base sm:text-lg text-amber-400 font-semibold">
                            {tr("Ижодкорнинг шахсий кабинети", "Ijodkorning shaxsiy kabineti", "Личный кабинет музыканта", "Musician Dashboard")}
                        </h1>
                        <p className="text-xs text-neutral-400 mt-1">
                            {tr("Хуш келибсиз", "Xush kelibsiz", "Добро пожаловать", "Welcome")}, {session.user.name || session.user.email}! {tr("Трекларингиз ва видеоклипларингизни бошқаринг.", "Treklaringiz va videokliplaringizni boshqaring.", "Управляйте своими треками и видеоклипами.", "Manage your tracks and video clips.")}
                        </p>
                    </div>

                    {/* Блок кнопок с правильной шириной подложки (w-fit) */}
                    <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
                        
                        {/* Кнопка 1: Настройки профиля */}
                        <div className="relative h-[42px] w-fit group flex items-center justify-center cursor-pointer">
                            <div className="absolute inset-0 bg-gradient-to-r from-black to-gray-600 rounded-lg z-0 shadow-[0_0_15px_rgba(57,255,20,0.15)] transition-all duration-500 group-hover:shadow-[inset_0_0_20px_rgba(0,0,0,1)]" />
                            <Link
                                href="/dashboard/profile"
                                className="relative h-[34px] z-10 flex items-center justify-center gap-1 bg-black text-[#39FF14] hover:text-white px-3 rounded-md border-[2px] border-transparent bg-clip-border text-[10px] font-bold uppercase tracking-wider transition-all duration-300 overflow-hidden group-hover:scale-95 group-active:scale-90 whitespace-nowrap"
                                style={{ 
                                    borderImageSource: 'linear-gradient(to right, #000000, #FFDA09, #39FF14, #FFDA09, #000000)', 
                                    borderImageSlice: 1 
                                }}
                            >
                                <div className="absolute inset-0 w-full h-full pointer-events-none overflow-hidden">
                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#39FF14]/40 to-transparent -translate-x-full group-hover:animate-shimmer" />
                                </div>
                                <Settings size={13} className="text-[#39FF14] relative z-10 shrink-0" />
                                <span className="relative z-10">{tr("Профил созламаси", "Profil sozlamasi", "Настройки профиля", "Profile settings")}</span>
                            </Link>
                        </div>

                        {/* Кнопка 2: Загрузить трек */}
                        <div className="relative h-[42px] w-fit group flex items-center justify-center cursor-pointer">
                            <div className="absolute inset-0 bg-gradient-to-r from-black to-gray-600 rounded-lg z-0 shadow-[0_0_15px_rgba(255,218,9,0.15)] transition-all duration-500 group-hover:shadow-[inset_0_0_20px_rgba(0,0,0,1)]" />
                            <Link
                                href="/dashboard/tracks/new"
                                className="relative h-[34px] z-10 flex items-center justify-center gap-1 bg-black text-[#FFDA09] hover:text-white px-3 rounded-md border-[2px] border-transparent bg-clip-border text-[10px] font-bold uppercase tracking-wider transition-all duration-300 overflow-hidden group-hover:scale-95 group-active:scale-90 whitespace-nowrap"
                                style={{ 
                                    borderImageSource: 'linear-gradient(to right, #000000, #FFDA09, #39FF14, #FFDA09, #000000)', 
                                    borderImageSlice: 1 
                                }}
                            >
                                <div className="absolute inset-0 w-full h-full pointer-events-none overflow-hidden">
                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#FFDA09]/40 to-transparent -translate-x-full group-hover:animate-shimmer" />
                                </div>
                                <Plus size={13} className="text-[#FFDA09] relative z-10 shrink-0" />
                                <span className="relative z-10">{tr("Трек юклаш", "Trek yuklash", "Загрузить трек", "Upload track")}</span>
                            </Link>
                        </div>

                        {/* Кнопка 3: Загрузить клип */}
                        <div className="relative h-[42px] w-fit group flex items-center justify-center cursor-pointer">
                            <div className="absolute inset-0 bg-gradient-to-r from-black to-gray-600 rounded-lg z-0 shadow-[0_0_15px_rgba(57,255,20,0.15)] transition-all duration-500 group-hover:shadow-[inset_0_0_20px_rgba(0,0,0,1)]" />
                            <Link
                                href="/dashboard/videos/new"
                                className="relative h-[34px] z-10 flex items-center justify-center gap-1 bg-black text-[#39FF14] hover:text-white px-3 rounded-md border-[2px] border-transparent bg-clip-border text-[10px] font-bold uppercase tracking-wider transition-all duration-300 overflow-hidden group-hover:scale-95 group-active:scale-90 whitespace-nowrap"
                                style={{ 
                                    borderImageSource: 'linear-gradient(to right, #000000, #FFDA09, #39FF14, #FFDA09, #000000)', 
                                    borderImageSlice: 1 
                                }}
                            >
                                <div className="absolute inset-0 w-full h-full pointer-events-none overflow-hidden">
                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#39FF14]/40 to-transparent -translate-x-full group-hover:animate-shimmer" />
                                </div>
                                <Film size={13} className="text-[#39FF14] relative z-10 shrink-0" />
                                <span className="relative z-10">{tr("Клип юклаш", "Klip yuklash", "Загрузить клип", "Upload clip")}</span>
                            </Link>
                        </div>

                    </div>
                </div>

                {/* Секция треков */}
                <div className="space-y-6">
                    <div className="flex items-center gap-2">
                        <Music className="w-4 h-4 text-amber-400" />
                        <h2 className="text-sm sm:text-base text-amber-400 tracking-wide font-medium">
                            {tr("Сизнинг қўшиқларингиз", "Sizning qo'shiqlaringiz", "Ваши треки и релизы", "Your tracks and releases")}
                        </h2>
                    </div>

                    {userTracks.length === 0 ? (
                        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 text-center space-y-4">
                            <p className="text-neutral-400 text-xs">
                                {tr("Сизда юкланган қўшиқлар йўқ.", "Sizda yuklangan qo'shiqlar yo'q.", "У вас пока нет загруженных треков.", "You have no uploaded tracks yet.")}
                            </p>
                            <div className="relative w-fit mx-auto h-[42px] group flex items-center justify-center cursor-pointer">
                                <div className="absolute inset-0 bg-gradient-to-r from-black to-gray-600 rounded-lg z-0 shadow-[0_0_15px_rgba(255,218,9,0.15)] transition-all duration-500 group-hover:shadow-[inset_0_0_20px_rgba(0,0,0,1)]" />
                                <Link
                                    href="/dashboard/tracks/new"
                                    className="relative h-[34px] z-10 flex items-center justify-center bg-black text-[#FFDA09] hover:text-white px-3 rounded-md border-[2px] border-transparent bg-clip-border text-[10px] font-bold uppercase tracking-wider transition-all duration-300 overflow-hidden group-hover:scale-95 group-active:scale-90 whitespace-nowrap"
                                    style={{ 
                                        borderImageSource: 'linear-gradient(to right, #000000, #FFDA09, #39FF14, #FFDA09, #000000)', 
                                        borderImageSlice: 1 
                                    }}
                                >
                                    <div className="absolute inset-0 w-full h-full pointer-events-none overflow-hidden">
                                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#FFDA09]/40 to-transparent -translate-x-full group-hover:animate-shimmer" />
                                    </div>
                                    <span className="relative z-10">{tr("Биринчи қўшиқни юкланг", "Birinchi qo'shiqni yuklang", "Опубликуйте первый трек", "Publish your first track")}</span>
                                </Link>
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-4">
                            {userTracks.map((track: any) => (
                                <TrackCard key={track._id} track={track} />
                            ))}
                        </div>
                    )}
                </div>

                {/* Секция видеоклипов */}
                <div className="space-y-6 pt-6 border-t border-neutral-800">
                    <div className="flex items-center gap-2">
                        <Film className="w-4 h-4 text-emerald-400" />
                        <h2 className="text-sm sm:text-base text-emerald-400 tracking-wide font-medium">
                            {tr("Сизнинг видеоклипларингиз", "Sizning videokliplaringiz", "Ваши видеоклипы", "Your video clips")}
                        </h2>
                    </div>

                    {userVideos.length === 0 ? (
                        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 text-center space-y-4">
                            <p className="text-neutral-400 text-xs">
                                {tr("Сизда юкланган видеоклиплар йўқ.", "Sizda yuklangan videokliplar yo'q.", "У вас пока нет загруженных видеоклипов.", "You have no uploaded video clips yet.")}
                            </p>
                            <div className="relative w-fit mx-auto h-[42px] group flex items-center justify-center cursor-pointer">
                                <div className="absolute inset-0 bg-gradient-to-r from-black to-gray-600 rounded-lg z-0 shadow-[0_0_15px_rgba(57,255,20,0.15)] transition-all duration-500 group-hover:shadow-[inset_0_0_20px_rgba(0,0,0,1)]" />
                                <Link
                                    href="/dashboard/videos/new"
                                    className="relative h-[34px] z-10 flex items-center justify-center bg-black text-[#39FF14] hover:text-white px-3 rounded-md border-[2px] border-transparent bg-clip-border text-[10px] font-bold uppercase tracking-wider transition-all duration-300 overflow-hidden group-hover:scale-95 group-active:scale-90 whitespace-nowrap"
                                    style={{ 
                                        borderImageSource: 'linear-gradient(to right, #000000, #FFDA09, #39FF14, #FFDA09, #000000)', 
                                        borderImageSlice: 1 
                                    }}
                                >
                                    <div className="absolute inset-0 w-full h-full pointer-events-none overflow-hidden">
                                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#39FF14]/40 to-transparent -translate-x-full group-hover:animate-shimmer" />
                                    </div>
                                    <span className="relative z-10">{tr("Биринчи клипингизни юкланг", "Birinchi klipingizni yuklang", "Загрузите свой первый клип", "Upload your first clip")}</span>
                                </Link>
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-4">
                            {userVideos.map((video: any) => (
                                <VideoCard key={video._id} video={video} />
                            ))}
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
}