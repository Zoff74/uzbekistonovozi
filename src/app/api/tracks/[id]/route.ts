import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongoose";
import { Track } from "@/models/Track";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth.config";
import { tr } from "@/utils/translate";

// 0. Получение трека
export async function GET(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        await dbConnect();
        const { id } = params;

        const track = await (Track as any).findById(id);
        if (!track) {
            return NextResponse.json({ 
                error: tr("Трек топилмади", "Trek topilmadi", "Трек не найден", "Track not found") 
            }, { status: 404 });
        }

        return NextResponse.json({ success: true, track });
    } catch (error) {
        console.error("Get Track Error:", error);
        return NextResponse.json({ 
            error: tr("Сервер хатолиги", "Server xatoligi", "Ошибка сервера", "Server error") 
        }, { status: 500 });
    }
}

// 1. Удаление трека
export async function DELETE(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        
        if (!session || !session.user) {
            return NextResponse.json({ 
                error: tr("Авторизация талаб қилинади", "Avtorizatsiya talab qilinadi", "Требуется авторизация", "Authorization required") 
            }, { status: 401 });
        }

        await dbConnect();
        const { id } = params;

        const track = await (Track as any).findById(id);
        if (!track) {
            return NextResponse.json({ 
                error: tr("Трек топилмади", "Trek topilmadi", "Трек не найден", "Track not found") 
            }, { status: 404 });
        }

        const userId = (session.user as any).id;
        const isAdmin = (session.user as any).isAdmin === true;
        const isAuthor = track.authorId && track.authorId.toString() === userId;

        if (!isAuthor && !isAdmin) {
            return NextResponse.json({ 
                error: tr("Рухсат йўқ", "Ruxsat yo'q", "Доступ запрещен", "Access denied") 
            }, { status: 403 });
        }

        await (Track as any).findByIdAndDelete(id);

        return NextResponse.json({ 
            success: true, 
            message: tr("Трек ўчирилди", "Trek o'chirildi", "Трек удален", "Track deleted") 
        });
    } catch (error) {
        console.error("Delete Track Error:", error);
        return NextResponse.json({ 
            error: tr("Сервер хатолиги", "Server xatoligi", "Ошибка сервера", "Server error") 
        }, { status: 500 });
    }
}

// 2. Редактирование / Обновление трека
export async function PUT(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        
        if (!session || !session.user) {
            return NextResponse.json({ 
                error: tr("Авторизация талаб қилинади", "Avtorizatsiya talab qilinadi", "Требуется авторизация", "Authorization required") 
            }, { status: 401 });
        }

        await dbConnect();
        const { id } = params;
        const body = await request.json();

        const track = await (Track as any).findById(id);
        if (!track) {
            return NextResponse.json({ 
                error: tr("Трек топилмади", "Trek topilmadi", "Трек не найден", "Track not found") 
            }, { status: 404 });
        }

        const userId = (session.user as any).id;
        const isAdmin = (session.user as any).isAdmin === true;
        const isAuthor = track.authorId && track.authorId.toString() === userId;

        if (!isAuthor && !isAdmin) {
            return NextResponse.json({ 
                error: tr("Рухсат йўқ", "Ruxsat yo'q", "Доступ запрещен", "Access denied") 
            }, { status: 403 });
        }

        if (body.title !== undefined) track.title = body.title;
        if (body.singer !== undefined) track.singer = body.singer;
        if (body.genre !== undefined) track.genre = body.genre;
        if (body.description !== undefined) track.description = body.description;
        if (body.cover !== undefined) track.cover = body.cover;
        if (body.status !== undefined) track.status = body.status;

        if (body.audioUrl !== undefined && body.audioUrl !== track.audioUrl) {
            if (body.audioUrl === "") {
                track.audioUrl = "";
            } else {
                const createdAtTime = new Date(track.createdAt || track._id.getTimestamp()).getTime();
                const now = Date.now();
                const twentyFourHours = 24 * 60 * 60 * 1000;

                if (now - createdAtTime > twentyFourHours) {
                    return NextResponse.json(
                        { error: tr("Аудиофайлни ўзгартириш муддати (24 соат) тугаган!", "Audiofaylni o'zgartirish muddati (24 soat) tugagan!", "Срок изменения аудиофайла (24 часа) истек!", "The time limit (24 hours) for changing the audio file has expired!") }, 
                        { status: 400 }
                    );
                }
                track.audioUrl = body.audioUrl;
            }
        }

        await track.save();

        return NextResponse.json({ 
            success: true, 
            message: tr("Трек янгиланди", "Trek yangilandi", "Трек обновлен", "Track updated"), 
            track 
        });
    } catch (error) {
        console.error("Update Track Error:", error);
        return NextResponse.json({ 
            error: tr("Сервер хатолиги", "Server xatoligi", "Ошибка сервера", "Server error") 
        }, { status: 500 });
    }
}