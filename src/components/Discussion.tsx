"use client";
//src\components\Discussion.tsx
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { MessageSquare, Send, User, CornerDownRight, X, ChevronDown, ChevronUp } from "lucide-react";
import { tr } from "@/utils/translate";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

interface CommentItem {
  id: string;
  parentId?: string | null;
  user: { name: string; image?: string | null };
  text: string;
  replyTo?: { userName: string; text: string } | null;
  createdAt: string;
}

interface DiscussionProps {
  targetId: string;
  targetType?: string;
  onReady?: () => void;
}

export default function Discussion({ targetId, targetType = "track", onReady }: DiscussionProps) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const isAuthenticated = status === "authenticated" && Boolean(session?.user);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [newText, setNewText] = useState("");
  const [replyingTo, setReplyingTo] = useState<{ id: string; rootId: string; name: string } | null>(null);
  const [expandedThreads, setExpandedThreads] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    if (!targetId) {
      setIsLoading(false);
      onReadyRef.current?.();
      return;
    }
    let isMounted = true;
    const abortController = new AbortController();
    setIsLoading(true);
    fetch(`/api/discussions?targetId=${encodeURIComponent(targetId)}`, { signal: abortController.signal })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (isMounted && Array.isArray(data)) setComments(data);
      })
      .catch((err) => {
        if (err?.name !== "AbortError") console.error(err);
      })
      .finally(() => {
        if (!isMounted || abortController.signal.aborted) return;
        setIsLoading(false);
        onReadyRef.current?.();
      });
    return () => {
      isMounted = false;
      abortController.abort();
    };
  }, [targetId]);

  const { rootComments, repliesByRootId } = useMemo(() => {
    const roots: CommentItem[] = [];
    const byId = new Map<string, CommentItem>();
    for (const item of comments) {
      byId.set(item.id, item);
    }

    const resolveRootId = (item: CommentItem): string | null => {
      if (!item.parentId) return null;
      let currId: string | null | undefined = item.parentId;
      const visited = new Set<string>([item.id]);
      while (currId) {
        if (visited.has(currId)) break;
        visited.add(currId);
        const parent = byId.get(currId);
        if (!parent) return currId;
        if (!parent.parentId) return parent.id;
        currId = parent.parentId;
      }
      return item.parentId;
    };

    const grouped = new Map<string, CommentItem[]>();
    for (const item of comments) {
      const rootId = resolveRootId(item);
      if (!rootId) {
        roots.push(item);
      } else {
        const list = grouped.get(rootId) || [];
        list.push(item);
        grouped.set(rootId, list);
      }
    }

    return { rootComments: roots, repliesByRootId: grouped };
  }, [comments]);

  const toggleThread = useCallback((rootId: string) => {
    setExpandedThreads((prev) => ({ ...prev, [rootId]: !prev[rootId] }));
  }, []);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated) {
      router.push("/auth/login");
      return;
    }
    if (!newText.trim()) return;
    const textToSend = newText.trim();
    const targetParentId = replyingTo?.id || null;
    const targetRootId = replyingTo?.rootId || null;
    setNewText("");
    setReplyingTo(null);
    try {
      const res = await fetch("/api/discussions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId, targetType, text: textToSend, parentId: targetParentId }),
      });
      if (res.ok) {
        const savedComment: CommentItem = await res.json();
        setComments((prev) => [...prev, savedComment]);
        if (targetRootId) {
          setExpandedThreads((prev) => ({ ...prev, [targetRootId]: true }));
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex flex-col h-full bg-neutral-950 text-white rounded-2xl overflow-hidden border border-neutral-800 shadow-xl">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-neutral-800 bg-neutral-900/60">
        <MessageSquare size={18} className="text-emerald-400" />
        <h4 className="font-bold text-sm">{tr("Муҳокама ва чат", "Muhokama va chat", "Обсуждение и чат", "Chat & Comments")}</h4>
        <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400">{comments.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {isLoading ? (
          <div className="text-center text-xs text-neutral-500 my-auto">{tr("Юкланмоқда...", "Yuklanmoqda...", "Загрузка...", "Loading...")}</div>
        ) : rootComments.length === 0 ? (
          <div className="text-center text-xs text-neutral-500 my-auto">{tr("Ҳали изох - коментлар йўқ. Биринчи бўлиб ёзинг!", "Hali izoh - kommentlar yo'q. Birinchi bo'lib yozing!", "Пока нет комментариев. Будьте первыми!", "No comments yet. Be the first!")}</div>
        ) : (
          rootComments.map((item) => {
            const replies = repliesByRootId.get(item.id) || [];
            const isExpanded = Boolean(expandedThreads[item.id]);

            return (
              <div key={item.id} className="p-3 rounded-xl bg-neutral-900 border border-neutral-800/80 flex flex-col gap-2">
                <div className="flex gap-3">
                  <div className="w-9 h-9 rounded-full bg-neutral-800 flex-shrink-0 flex items-center justify-center overflow-hidden border border-neutral-700">
                    {item.user?.image ? <img src={item.user.image} alt={item.user?.name || "User"} className="w-full h-full object-cover" /> : <User size={16} className="text-neutral-400" />}
                  </div>
                  <div className="flex-1 flex flex-col gap-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-xs text-emerald-400 truncate">{item.user?.name || "Foydalanuvchi"}</span>
                      <span className="text-[10px] text-neutral-500 flex-shrink-0">{item.createdAt}</span>
                    </div>
                    <p className="text-xs text-neutral-300 leading-relaxed break-words">{item.text}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-0.5">
                  <div>
                    {replies.length > 0 && (
                      <button
                        type="button"
                        onClick={() => toggleThread(item.id)}
                        className="text-[11px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition cursor-pointer bg-transparent border-none p-0"
                      >
                        {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        <span>
                          {isExpanded
                            ? tr("Жавобларни яшириш", "Javoblarni yashirish", "Скрыть ответы", "Hide replies")
                            : tr(`Жавоблар (${replies.length})`, `Javoblar (${replies.length})`, `Ответы (${replies.length})`, `Replies (${replies.length})`)}
                        </span>
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setReplyingTo({ id: item.id, rootId: item.id, name: item.user.name })}
                    className="text-[11px] text-neutral-400 hover:text-emerald-400 flex items-center gap-1 transition cursor-pointer bg-transparent border-none"
                  >
                    <CornerDownRight size={12} />
                    {tr("Жавоб бериш", "Javob berish", "Ответить", "Reply")}
                  </button>
                </div>

                {replies.length > 0 && isExpanded && (
                  <div className="mt-1 pl-3 border-l-2 border-emerald-500/50 flex flex-col gap-2">
                    {replies.map((reply) => (
                      <div key={reply.id} className="p-2.5 rounded-lg bg-neutral-950/90 border border-neutral-800/70 flex flex-col gap-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-[11px] text-emerald-400 truncate">
                            {reply.user?.name || "Foydalanuvchi"}
                            {reply.replyTo?.userName && (
                              <span className="text-neutral-400 font-normal ml-1.5">
                                → @{reply.replyTo.userName}
                              </span>
                            )}
                          </span>
                          <span className="text-[10px] text-neutral-500 flex-shrink-0">{reply.createdAt}</span>
                        </div>
                        <p className="text-xs text-neutral-300 leading-relaxed break-words">{reply.text}</p>
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => setReplyingTo({ id: reply.id, rootId: item.id, name: reply.user.name })}
                            className="text-[10px] text-neutral-400 hover:text-emerald-400 flex items-center gap-1 transition cursor-pointer bg-transparent border-none p-0"
                          >
                            <CornerDownRight size={11} />
                            {tr("Жавоб бериш", "Javob berish", "Ответить", "Reply")}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      {replyingTo && (
        <div className="px-4 py-2 bg-neutral-900 border-t border-neutral-800 flex items-center justify-between text-xs">
          <span className="text-neutral-400 truncate">{tr("Жавоб:", "Javob:", "Ответ для", "Replying to")} <strong className="text-emerald-400">{replyingTo.name}</strong></span>
          <button type="button" onClick={() => setReplyingTo(null)} className="text-neutral-500 hover:text-white transition bg-transparent border-none cursor-pointer"><X size={14} /></button>
        </div>
      )}
      <form onSubmit={handleSend} className="p-3 border-t border-neutral-800 bg-neutral-900 flex items-center gap-2">
        <input type="text" value={newText} onChange={(e) => setNewText(e.target.value)} placeholder={isAuthenticated ? (replyingTo ? tr("Жавоб ёзиш...", "Javob yozish...", "Написать ответ...", "Write a reply...") : tr("Коментарий ёзиш...", "Kommentariy yozish...", "Написать комментарий...", "Write a comment...")) : tr("Коментарий ёзиш учун киринг...", "Kommentariy yozish uchun kiring...", "Войдите, чтобы написать...", "Sign in to write...")} className="flex-1 bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 transition" />
        <button type="submit" className="p-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-neutral-950 transition cursor-pointer border-none flex items-center justify-center flex-shrink-0"><Send size={16} /></button>
      </form>
    </div>
  );
}