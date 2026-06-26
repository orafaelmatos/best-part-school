import { startTransition, useDeferredValue, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2, MessageSquarePlus, Search } from "lucide-react";

import {
  aiStudySessionsQueryKey,
  buildNewModePath,
  buildSessionPath,
  fetchAiStudySessions,
  formatDateTime,
  modeLabel,
  SessionSummary,
} from "@/lib/aiStudy";
import { cn } from "@/lib/utils";

const ConversationSidebarItem = ({
  session,
  active,
  onClick,
}: {
  session: SessionSummary;
  active: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "w-full rounded-2xl border px-3.5 py-3 text-left transition",
      active
        ? "border-slate-900 bg-slate-900 text-white shadow-sm"
        : "border-transparent bg-white/75 hover:border-slate-200 hover:bg-white",
    )}
  >
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{session.title || "Nova conversa"}</p>
        <p className={cn("mt-1 truncate text-xs", active ? "text-white/70" : "text-muted-foreground")}>
          {session.lesson_detail?.title || "Aula não vinculada"}
        </p>
      </div>
      <span
        className={cn(
          "shrink-0 rounded-full px-2 py-1 text-[10px] font-medium",
          active ? "bg-white/10 text-white" : "bg-slate-100 text-slate-600",
        )}
      >
        {session.message_count}
      </span>
    </div>
    <div className={cn("mt-3 flex items-center justify-between gap-3 text-[11px]", active ? "text-white/70" : "text-muted-foreground")}>
      <span className="truncate">{modeLabel[session.mode]}</span>
      <span className="shrink-0">{formatDateTime(session.last_interaction_at)}</span>
    </div>
  </button>
);

const AIConversationSidebar = () => {
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId: string }>();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);

  const sessionsQuery = useQuery({
    queryKey: aiStudySessionsQueryKey(deferredSearch),
    queryFn: () => fetchAiStudySessions(deferredSearch),
  });

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] border border-border/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] p-3 shadow-sm">
      <button
        type="button"
        onClick={() => navigate(buildNewModePath())}
        className="inline-flex w-full items-center gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90"
      >
        <MessageSquarePlus className="h-4 w-4" />
        Novo chat
      </button>

      <div className="relative mt-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar conversas"
          className="w-full rounded-2xl border border-border bg-white/80 py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-primary/30 focus:ring-2 focus:ring-primary/10"
        />
      </div>

      <div className="mt-4 mb-2 px-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">Recentes</p>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto pr-1">
        {sessionsQuery.isLoading ? (
          <div className="flex items-center gap-2 rounded-2xl border border-border bg-muted/50 px-4 py-5 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando conversas...
          </div>
        ) : sessionsQuery.data?.length ? (
          sessionsQuery.data.map((session) => (
            <ConversationSidebarItem
              key={session.id}
              session={session}
              active={session.id === sessionId}
              onClick={() => {
                startTransition(() => navigate(buildSessionPath(session.id)));
              }}
            />
          ))
        ) : (
          <div className="rounded-[24px] border border-dashed border-border bg-muted/40 p-5 text-sm text-muted-foreground">
            Nenhuma conversa salva ainda. Escolha uma aula para abrir o primeiro chat.
          </div>
        )}
      </div>
    </section>
  );
};

export default AIConversationSidebar;
