import { NextResponse, NextRequest } from "next/server";
import { revalidatePath } from "next/cache"; // <--- 1. Импортируем ревалидацию
import { dbConnect } from "@/lib/mongoose";
import { Video } from "@/models/Video";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth.config";
import { getGridFSBuckets } from "@/lib/gridfs";
import { Types } from "mongoose";
import { tr } from "@/utils/translate";

export const dynamic = 'force-dynamic';

// 0. Получение видео по ID (для формы редактирования)
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        await dbConnect();
        const { id } = await params;

        const video = await (Video as any).findById(id);
        if (!video) {
            return NextResponse.json({ 
                error: tr(
                    "Клип топилмади",
                    "Klip topilmadi",
                    "Клип не найден",
                    "Clip not found"
                ) 
            }, { status: 404 });
        }

        return NextResponse.json({ 
            success: true, 
            video 
        });
    } catch (error) {
        console.error("Get Video Error:", error);
        return NextResponse.json({ 
            error: tr(
                "Сервер хатолиги",
                "Server xatoligi",
                "Ошибка сервера",
                "Server error"
            ) 
        }, { status: 500 });
    }
}

// 1. Удаление видео
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json({ 
                error: tr(
                    "Авторизация талаб қилинади",
                    "Avtorizatsiya talab qilinadi",
                    "Требуется авторизация",
                    "Authorization required"
                ) 
            }, { status: 401 });
        }

        await dbConnect();
        const { id } = await params;

        const video = await (Video as any).findById(id);
        if (!video) {
            return NextResponse.json({ 
                error: tr(
                    "Клип топилмади",
                    "Klip topilmadi",
                    "Клип не найден",
                    "Clip not found"
                ) 
            }, { status: 404 });
        }

        const userId = (session.user as any).id;
        const userRole = (session.user as any).role;
        const isAdmin = userRole === 'admin' || (session.user as any).isAdmin === true;
        const isAuthor = video.authorId && video.authorId.toString() === userId.toString();

        if (!isAuthor && !isAdmin) {
            return NextResponse.json({ 
                error: tr(
                    "Рухсат йўқ",
                    "Ruxsat yo'q",
                    "Доступ запрещен",
                    "Access denied"
                ) 
            }, { status: 403 });
        }

        // Очистка файлов из GridFS (обложка и видеофайл) с логированием
        try {
            const { bucket } = await getGridFSBuckets();
            const extractGridFsId = (url: string) => {
                if (!url || typeof url !== 'string' || !url.startsWith('/api/media/')) return null;
                const parts = url.split('/');
                const idStr = parts[parts.length - 1];
                return Types.ObjectId.isValid(idStr) ? new Types.ObjectId(idStr) : null;
            };

            const coverFileId = extractGridFsId(video.cover);
            if (coverFileId) {
                try {
                    await bucket.delete(coverFileId);
                    console.log(`[DELETE GRIDFS] Файл обложки ${coverFileId} успешно удален`);
                } catch (coverErr: any) {
                    console.warn(`[DELETE GRIDFS WARNING] Не удалось удалить обложку ${coverFileId}:`, coverErr.message);
                }
            }

            const videoFileId = extractGridFsId(video.videoUrl);
            if (videoFileId) {
                try {
                    await bucket.delete(videoFileId);
                    console.log(`[DELETE GRIDFS] Файл видео ${videoFileId} успешно удален`);
                } catch (videoErr: any) {
                    console.warn(`[DELETE GRIDFS WARNING] Не удалось удалить видео ${videoFileId}:`, videoErr.message);
                }
            }
        } catch (fsError) {
            console.error("Delete Video GridFS Error:", fsError);
        }

        // Жесткое удаление документа из MongoDB
        const deletedVideo = await (Video as any).findByIdAndDelete(id);
        if (!deletedVideo) {
            console.error(`[DELETE ERROR] Документ видео с ID ${id} не найден в базе при удалении.`);
            return NextResponse.json({ error: "Клип не найден в базе данных при удалении" }, { status: 404 });
        }
        console.log(`[DELETE DB SUCCESS] Документ видео ${id} полностью стерт из MongoDB.`);

        // <--- 2. Сбрасываем кэш страниц дашборда и каталога
        revalidatePath('/dashboard');
        revalidatePath('/catalogVideos');
        revalidatePath('/', 'layout');

        return NextResponse.json({ 
            success: true, 
            message: tr(
                "Клип ўчирилди",
                "Klip o'chirildi",
                "Клип удален",
                "Clip deleted"
            ) 
        });
    } catch (error) {
        console.error("Delete Video Error:", error);
        return NextResponse.json({ 
            error: tr(
                "Сервер хатолиги",
                "Server xatoligi",
                "Ошибка сервера",
                "Server error"
            ) 
        }, { status: 500 });
    }
}

// 2. Редактирование / Обновление видеоклипа
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        
        if (!session || !session.user) {
            return NextResponse.json({ 
                error: tr(
                    "Авторизация талаб қилинади",
                    "Avtorizatsiya talab qilinadi",
                    "Требуется авторизация",
                    "Authorization required"
                ) 
            }, { status: 401 });
        }

        await dbConnect();
        const { id } = await params;
        const body = await request.json();

        const video = await (Video as any).findById(id);
        if (!video) {
            return NextResponse.json({ 
                error: tr(
                    "Клип топилмади",
                    "Klip topilmadi",
                    "Клип не найден",
                    "Clip not found"
                ) 
            }, { status: 404 });
        }

        const userId = (session.user as any).id;
        const userRole = (session.user as any).role;
        const isAdmin = userRole === 'admin' || (session.user as any).isAdmin === true;
        const isAuthor = video.authorId && video.authorId.toString() === userId.toString();

        if (!isAuthor && !isAdmin) {
            return NextResponse.json({ 
                error: tr(
                    "Рухсат йўқ",
                    "Ruxsat yo'q",
                    "Доступ запрещен",
                    "Access denied"
                ) 
            }, { status: 403 });
        }

        // Обновляем текстовые поля
        if (body.title !== undefined) video.title = body.title;
        if (body.singer !== undefined) video.singer = body.singer;
        if (body.genre !== undefined) video.genre = body.genre;
        if (body.description !== undefined) video.description = body.description;
        if (body.cover !== undefined) video.cover = body.cover;
        if (body.status !== undefined) video.status = body.status;

        // Обновление видеофайла с проверкой 24 часов
        if (body.videoUrl !== undefined && body.videoUrl !== video.videoUrl) {
            if (body.videoUrl === "") {
                video.videoUrl = "";
            } else {
                const createdAtTime = new Date(video.createdAt || video._id.getTimestamp()).getTime();
                const now = Date.now();
                const twentyFourHours = 24 * 60 * 60 * 1000;

                if (now - createdAtTime > twentyFourHours) {
                    return NextResponse.json(
                        { 
                            error: tr(
                                "Видеофайлга ўзгартириш киритиш муддати (24 соат) тугаган!",
                                "Videofaylga o'zgartirish kiritish muddati (24 soat) tugagan!",
                                "Разрешенный срок для внесений изменений в видеофайл (24 часа) истек!",
                                "The time limit (24 hours) for changing the video file has expired!"
                            ) 
                        }, 
                        { status: 400 }
                    );
                }
                video.videoUrl = body.videoUrl;
            }
        }

        await video.save();

        // <--- 3. Сбрасываем кэш и при обновлении данных
        revalidatePath('/dashboard');
        revalidatePath('/catalogVideos');
        revalidatePath('/', 'layout');

        return NextResponse.json({ 
            success: true, 
            message: tr(
                "Видео янгиланди",
                "Video yangilandi",
                "Видео обновлено",
                "Video updated"
            ), 
            video 
        });
    } catch (error) {
        console.error("Update Video Error:", error);
        return NextResponse.json({ 
            error: tr(
                "Сервер хатолиги",
                "Server xatoligi",
                "Ошибка сервера",
                "Server error"
            ) 
        }, { status: 500 });
    }
}