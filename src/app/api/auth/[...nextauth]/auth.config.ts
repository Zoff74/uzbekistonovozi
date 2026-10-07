// src/app/api/auth/[...nextauth]/auth.config.ts
import { NextAuthOptions as NextOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import type { IUser } from "@/models/User";
import type { Document } from "mongoose";
import { tr } from "@/utils/translate";

const THIRTY_DAYS_IN_SECONDS = 60 * 60 * 24 * 30;
const TWELVE_HOURS_IN_SECONDS = 60 * 60 * 12;
const isProd = process.env.NODE_ENV === "production";

const ADMIN_ID = process.env.ADMIN_RECEIVER_ID;
const isTestMode = process.env.NEXT_PUBLIC_TEST_MODE === "true";

const PRIVILEGED_USER_IDS = process.env.PRIVILEGED_USER_IDS_LIST
    ? process.env.PRIVILEGED_USER_IDS_LIST.split(',')
        .map(id => id.trim())
        .filter(id => {
            if (id === ADMIN_ID) return true; 
            return isTestMode; 
        })
    : [ADMIN_ID];

const getIsAdminStatus = (role: string | undefined): boolean => role === 'admin';

const getIsPrivilegedPosterStatus = (userId: string | undefined, role: string | undefined): boolean => {
    if (!userId) return false;
    return role === 'admin' || PRIVILEGED_USER_IDS.includes(userId);
};

export const authOptions: NextOptions = {
    providers: [
        CredentialsProvider({
            name: "Credentials",
            credentials: {
                email: { label: "Email", type: "text" },
                password: { label: "Password", type: "password" },
            },
            async authorize(credentials) {
                if (!credentials?.email || !credentials?.password) return null;

                const { dbConnect } = await import("@/lib/mongoose");
                const { getUserByEmailAndPassword } = await import("@/actions/auth.action");
                const Post = (await import("@/models/Post")).default;

                await dbConnect();
                const user = await getUserByEmailAndPassword(credentials.email, credentials.password);
                
                if (user) {
                    const mongooseUser = user as (IUser & Document & { phoneNumber?: string });
                    const userIdString = mongooseUser._id.toString();
                    
                    const authorsCount = mongooseUser.followingCount !== undefined 
                        ? mongooseUser.followingCount 
                        : (mongooseUser.following?.length || 0);

                    const followersCount = mongooseUser.followersCount !== undefined 
                        ? mongooseUser.followersCount 
                        : (mongooseUser.followers?.length || 0);

                    const postsCount = await Post.countDocuments({ 
                        authorId: mongooseUser._id, 
                        status: 'ACTIVE' 
                    });

                    return {
                        id: userIdString,
                        email: mongooseUser.email,
                        username: mongooseUser.username || "",
                        image: mongooseUser.image || "",
                        phoneNumber: mongooseUser.phoneNumber || "",
                        isAdmin: getIsAdminStatus(mongooseUser.role),
                        isPrivilegedPoster: getIsPrivilegedPosterStatus(userIdString, mongooseUser.role),
                        isTelegramLinked: mongooseUser.isTelegramVerified || false,
                        authorsCount,
                        followersCount,
                        postsCount,
                    };
                }
                
                throw new Error(tr(
                    "Бундай инсон Жамоада йўқ. Email ёки пароль нотўғри киритилган. Текшириб, қайтадан ёзинг!",
                    "Bunday inson Jamoada yo'q. Email yoki parol noto'g'ri kiritilgan. Tekshirib, qaytadan yozing!",
                    "Такого пользователя нет в системе. E-mail или пароль введены неверно. Проверьте и введите заново!",
                    "This user does not exist in the system. Incorrect email or password. Please check and try again!"
                ));
            }
        }),
    ],
    pages: { signIn: "/auth/login", error: "/auth/login" },
    useSecureCookies: isProd,
    cookies: {
        sessionToken: {
            name: `${isProd ? "__Secure-" : ""}next-auth.session-token`,
            options: {
                httpOnly: true,
                sameSite: 'lax',
                path: '/',
                secure: isProd,
            }
        }
    },
    callbacks: {
        async jwt({ token, user, trigger, session }) {
            if (user) {
                token.id = user.id;
                token.username = user.username;
                token.phoneNumber = (user as any).phoneNumber;
                token.isAdmin = user.isAdmin;
                token.isPrivilegedPoster = user.isPrivilegedPoster; 
                token.isTelegramLinked = user.isTelegramLinked;
                token.picture = user.image || "/img/avatar.webp";
            }

            // ИСПРАВЛЕНО: Безопасная проверка session (поддерживает и session.user, и просто session)
            if (trigger === "update" && session) {
                const incomingUser = session.user || session;
                
                if (incomingUser.username !== undefined) {
                    token.username = incomingUser.username;
                }
                if (incomingUser.image !== undefined) {
                    token.picture = incomingUser.image;
                }
                if (incomingUser.phoneNumber !== undefined) {
                    token.phoneNumber = incomingUser.phoneNumber;
                }
            }

            if (!token.picture) {
                token.picture = "/img/avatar.webp";
            }

            return token;
        },
        async session({ session, token }) {
            if (token && session.user) {
                session.user.id = token.id as string;
                session.user.username = (token.username as string) || "";
                session.user.image = token.picture as string;
                session.user.phoneNumber = token.phoneNumber as string;
                session.user.isAdmin = token.isAdmin as boolean;
                session.user.isPrivilegedPoster = token.isPrivilegedPoster as boolean;
                session.user.isTelegramLinked = token.isTelegramLinked as boolean;
                session.user.authorsCount = (token.authorsCount as number) || 0;
                session.user.followersCount = (token.followersCount as number) || 0;
                session.user.postsCount = (token.postsCount as number) || 0;
            }
            return session;
        }
    },
    session: { 
        strategy: "jwt", 
        maxAge: THIRTY_DAYS_IN_SECONDS,
        updateAge: TWELVE_HOURS_IN_SECONDS
    },
    secret: process.env.NEXTAUTH_SECRET,
};