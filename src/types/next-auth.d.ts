import NextAuth, { DefaultSession } from "next-auth";
import { JWT } from "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      username: string;
      phoneNumber?: string;
      occupation?: string;
      image?: string;
      isAdmin: boolean;
      isPrivilegedPoster: boolean;
      isTelegramLinked: boolean;
      authorsCount?: number;
      followersCount?: number;
      postsCount?: number;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    username: string;
    phoneNumber?: string;
    occupation?: string;
    image?: string;
    isAdmin: boolean;
    isPrivilegedPoster: boolean;
    isTelegramLinked: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    username: string;
    phoneNumber?: string;
    occupation?: string;
    picture?: string;
    isAdmin: boolean;
    isPrivilegedPoster: boolean;
    isTelegramLinked: boolean;
    authorsCount?: number;
    followersCount?: number;
    postsCount?: number;
  }
}