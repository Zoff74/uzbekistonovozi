import React from "react";
import type { Metadata } from "next";
import NextAuthSessionProvider from "@/components/SessionProvider";
import { PlayerProvider } from "@/context/PlayerContext";
import Player from "@/components/Player";
// @ts-ignore
import "./globals.css";

export const metadata: Metadata = {
  title: "Ўзбекистон овози",
  description: "Мусиқий маркетплейс ва платформа",
  icons: {
    icon: [
      {
        url: "/img/microfon.avif",
        sizes: "64x64",
        type: "image/avif",
      },
    ],
    shortcut: ["/img/microfon.avif"],
    apple: [
      {
        url: "/img/microfon.avif",
        sizes: "180x180",
        type: "image/avif",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="uz">
      <body className="bg-[#030712] text-white overflow-x-hidden antialiased">
        <NextAuthSessionProvider>
          <PlayerProvider>
            {children}
            <Player />
          </PlayerProvider>
        </NextAuthSessionProvider>
      </body>
    </html>
  );
}