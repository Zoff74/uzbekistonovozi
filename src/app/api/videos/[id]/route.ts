// src/app/api/videos/[id]/route.ts
import { NextResponse, NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { dbConnect } from "@/lib/mongoose";
import { Video } from "@/models/Video";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth.config";
import { getGridFSBuckets } from "@/lib/gridfs";
import { Types } from "mongoose";
import { tr } from "@/utils/translate";
import { deleteVideoFromTelegramStorage } from "@/actions/telegram.action";

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
        
        const videoAuthor = video.authorId || video.author || video.userId;
        const isAuthor = videoAuthor && userId && videoAuthor.toString() === userId.toString();

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

        // Очистка файлов из GridFS
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
                } catch (coverErr: any) {
                    console.warn(`[DELETE GRIDFS WARNING] Не удалось удалить обложку:`, coverErr.message);
                }
            }

            const videoFileId = extractGridFsId(video.videoUrl);
            if (videoFileId) {
                try {
                    await bucket.delete(videoFileId);
                } catch (videoErr: any) {
                    console.warn(`[DELETE GRIDFS WARNING] Не удалось удалить видео:`, videoErr.message);
                }
            }
        } catch (fsError) {
            console.error("Delete Video GridFS Error:", fsError);
        }

        // Очистка файла из общего котла Telegram
        if (video.telegramMessageId) {
            try {
                await deleteVideoFromTelegramStorage(video.telegramMessageId);
                console.log(`[TELEGRAM CLEANUP] Сообщение ${video.telegramMessageId} удалено из общего котла Telegram.`);
            } catch (tgDelErr: any) {
                console.warn(`[TELEGRAM DELETE WARNING] Не удалось удалить файл из хранилища Telegram:`, tgDelErr.message);
            }
        }

        const deletedVideo = await (Video as any).findByIdAndDelete(id);
        if (!deletedVideo) {
            return NextResponse.json({ error: "Клип не найден в базе данных при удалении" }, { status: 404 });
        }

        revalidatePath('/dashboard');
        revalidatePath('/catalogVideos');
        revalidatePath('/api/videos');
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

// 2. Редактирование / Обновление видеоклипа (с автоочисткой старых файлов)
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
        
        const videoAuthor = video.authorId || video.author || video.userId;
        const isAuthor = videoAuthor && userId && videoAuthor.toString() === userId.toString();

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

        const oldCoverUrl = video.cover;
        const oldVideoUrl = video.videoUrl;

        if (body.title !== undefined) video.title = body.title;
        if (body.singer !== undefined) video.singer = body.singer;
        if (body.genre !== undefined) video.genre = body.genre;
        if (body.description !== undefined) video.description = body.description;
        if (body.cover !== undefined) video.cover = body.cover;
        if (body.status !== undefined) video.status = body.status;

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

        try {
            const { bucket } = await getGridFSBuckets();
            const extractGridFsId = (url: string) => {
                if (!url || typeof url !== 'string' || !url.startsWith('/api/media/')) return null;
                const parts = url.split('/');
                const idStr = parts[parts.length - 1];
                return Types.ObjectId.isValid(idStr) ? new Types.ObjectId(idStr) : null;
            };

            if (body.cover !== undefined && body.cover !== oldCoverUrl && oldCoverUrl) {
                const oldCoverId = extractGridFsId(oldCoverUrl);
                if (oldCoverId) {
                    await bucket.delete(oldCoverId).catch(() => {});
                    console.log(`[CLEANUP] Старая обложка ${oldCoverId} удалена из GridFS`);
                }
            }

            if (body.videoUrl !== undefined && body.videoUrl !== oldVideoUrl && oldVideoUrl) {
                const oldVideoId = extractGridFsId(oldVideoUrl);
                if (oldVideoId) {
                    await bucket.delete(oldVideoId).catch(() => {});
                    console.log(`[CLEANUP] Старый видеофайл ${oldVideoId} удален из GridFS`);
                }
            }
        } catch (cleanupErr) {
            console.error("[CLEANUP ERROR] Ошибка при очистке старых файлов:", cleanupErr);
        }

        revalidatePath('/dashboard');
        revalidatePath('/catalogVideos');
        revalidatePath('/api/videos');
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