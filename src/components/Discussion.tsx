"use client";

import { useState, useEffect } from "react";
import { MessageSquare, Send, User, CornerDownRight, X } from "lucide-react";
import { tr } from "@/utils/translate";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

interface CommentItem {
  id: string;
  user: {
    name: string;
    image?: string | null;
  };
  text: string;
  replyTo?: {
    userName: string;
    text: string;
  } | null;
  createdAt: string;
}

interface DiscussionProps {
  targetId: string; // Универсальный ID (трека, видео, альбома и т.д.)
  targetType?: string; // "track", "video", "album" и т.д.
}

export default function Discussion({ targetId, targetType = "track" }: DiscussionProps) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const isAuthenticated = status === "authenticated" && Boolean(session?.user);

  const [comments, setComments] = useState<CommentItem[]>([]);
  const [newText, setNewText] = useState("");
  const [replyingTo, setReplyingTo] = useState<{ id: string; name: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Универсальный эндпоинт с query-параметром targetId
  const getUrl = `/api/discussions?targetId=${targetId}`;

  useEffect(() => {
    if (!targetId) return;

    let isMounted = true;
    setIsLoading(true);

    fetch(getUrl)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (isMounted && Array.isArray(data)) setComments(data);
      })
      .catch((err) => console.error(err))
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => { isMounted = false; };
  }, [targetId, getUrl]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated) {
      router.push("/auth/login");
      return;
    }
    if (!newText.trim()) return;

    const textToSend = newText.trim();
    const parentIdToSend = replyingTo?.id || null;

    setNewText("");
    setReplyingTo(null);

    try {
      const res = await fetch("/api/discussions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetId,
          targetType,
          text: textToSend,
          parentId: parentIdToSend,
        }),
      });

      if (res.ok) {
        const savedComment = await res.json();
        setComments((prev) => [savedComment, ...prev]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex flex-col h-full bg-neutral-950 text-white rounded-2xl overflow-hidden border border-neutral-800 shadow-xl">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-neutral-800 bg-neutral-900/60">
        <MessageSquare size={18} className="text-emerald-400" />
        <h4 className="font-bold text-sm">
          {tr("Муҳокама ва чат", "Muhokama va chat", "Обсуждение и чат", "Chat & Comments")}
        </h4>
        <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400">
          {comments.length}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {isLoading ? (
          <div className="text-center text-xs text-neutral-500 my-auto animate-pulse">
            {tr("Юкланмоқда...", "Yuklanmoqda...", "Загрузка...", "Loading...")}
          </div>
        ) : comments.length === 0 ? (
          <div className="text-center text-xs text-neutral-500 my-auto">
            {tr("Ҳали фикрлар йўқ. Биринчи бўлиб ёзинг!", "Hali fikrlar yo'q. Birinchi bo'lib yozing!", "Пока нет комментариев. Будьте первыми!", "No comments yet. Be the first!")}
          </div>
        ) : (
          comments.map((item) => (
            <div key={item.id} className="p-3 rounded-xl bg-neutral-900 border border-neutral-800/80 flex flex-col gap-2">
              <div className="flex gap-3">
                <div className="w-9 h-9 rounded-full bg-neutral-800 flex-shrink-0 flex items-center justify-center overflow-hidden border border-neutral-700">
                  {item.user?.image ? (
                    <img src={item.user.image} alt={item.user?.name || "User"} className="w-full h-full object-cover" />
                  ) : (
                    <User size={16} className="text-neutral-400" />
                  )}
                </div>

                <div className="flex-1 flex flex-col gap-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-xs text-emerald-400 truncate">{item.user?.name || "Foydalanuvchi"}</span>
                    <span className="text-[10px] text-neutral-500 flex-shrink-0">{item.createdAt}</span>
                  </div>

                  {item.replyTo && (
                    <div className="text-[11px] bg-neutral-950/80 border-l-2 border-emerald-500 px-2 py-1 rounded text-neutral-400 my-1">
                      <span className="text-emerald-400 font-medium">@{item.replyTo.userName}:</span> {item.replyTo.text}
                    </div>
                  )}

                  <p className="text-xs text-neutral-300 leading-relaxed break-words">{item.text}</p>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => setReplyingTo({ id: item.id, name: item.user.name })}
                  className="text-[11px] text-neutral-400 hover:text-emerald-400 flex items-center gap-1 transition cursor-pointer bg-transparent border-none"
                >
                  <CornerDownRight size={12} />
                  {tr("Жавоб бериш", "Javob berish", "Ответить", "Reply")}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {replyingTo && (
        <div className="px-4 py-2 bg-neutral-900 border-t border-neutral-800 flex items-center justify-between text-xs">
          <span className="text-neutral-400 truncate">
            {tr("Жавоб:", "Javob:", "Ответ для", "Replying to")} <strong className="text-emerald-400">{replyingTo.name}</strong>
          </span>
          <button onClick={() => setReplyingTo(null)} className="text-neutral-500 hover:text-white transition bg-transparent border-none cursor-pointer">
            <X size={14} />
          </button>
        </div>
      )}

      <form onSubmit={handleSend} className="p-3 border-t border-neutral-800 bg-neutral-900 flex items-center gap-2">
        <input
          type="text"
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          placeholder={isAuthenticated ? (replyingTo ? tr("Жавоб ёзиш...", "Javob yozish...", "Написать ответ...", "Write a reply...") : tr("Фикр ёзиш...", "Fikr yozish...", "Написать комментарий...", "Write a comment...")) : tr("Фикр ёзиш учун киринг...", "Fikr yozish uchun kiring...", "Войдите, чтобы написать...", "Sign in to write...")}
          className="flex-1 bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 transition"
        />
        <button
          type="submit"
          className="p-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-neutral-950 transition cursor-pointer border-none flex items-center justify-center flex-shrink-0"
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}