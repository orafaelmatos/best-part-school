import { startTransition, useDeferredValue, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  Ellipsis,
  Headphones,
  Loader2,
  MessageSquare,
  MessageSquarePlus,
  Pencil,
  Pin,
  Search,
  Trash2,
  type LucideIcon,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import {
  AIStudyMode,
  aiStudySessionsQueryKey,
  buildInterpreterSessionPath,
  buildNewModePath,
  buildSessionPath,
  fetchAiStudySessions,
  SessionSummary,
} from "@/lib/aiStudy";
import { APP_PATHS } from "@/lib/routes";
import { cn } from "@/lib/utils";

type WorkspaceId = "practice" | "interpreter";

type WorkspaceConfig = {
  id: WorkspaceId;
  label: string;
  basePath: string;
  newPath: string;
  modes: AIStudyMode[];
  icon: LucideIcon;
  emptyMessage: string;
  createLabel: string;
};

const WORKSPACES: WorkspaceConfig[] = [
  {
    id: "practice",
    label: "Praticar com IA",
    basePath: APP_PATHS.aiPractice,
    newPath: buildNewModePath(),
    modes: ["review", "speaking", "writing"],
    icon: MessageSquare,
    emptyMessage: "Nenhuma conversa salva ainda.",
    createLabel: "Novo chat",
  },
  {
    id: "interpreter",
    label: "Interprete IA",
    basePath: APP_PATHS.interpreter,
    newPath: APP_PATHS.interpreter,
    modes: ["listening"],
    icon: Headphones,
    emptyMessage: "Nenhum treino salvo ainda.",
    createLabel: "Novo treino",
  },
];

const buildWorkspaceSessionPath = (workspaceId: WorkspaceId, sessionId: string) =>
  workspaceId === "interpreter" ? buildInterpreterSessionPath(sessionId) : buildSessionPath(sessionId);

const ConversationSidebarItem = ({
  active,
  isRenaming,
  onCancelRename,
  onDelete,
  onRenameChange,
  onRenameSubmit,
  onSelect,
  onStartRename,
  onTogglePin,
  renameValue,
  session,
  workspaceIcon: WorkspaceIcon,
}: {
  session: SessionSummary;
  active: boolean;
  isRenaming: boolean;
  renameValue: string;
  workspaceIcon: LucideIcon;
  onSelect: () => void;
  onStartRename: () => void;
  onRenameChange: (value: string) => void;
  onRenameSubmit: () => void;
  onCancelRename: () => void;
  onTogglePin: () => void;
  onDelete: () => void;
}) => (
  <div
    className={cn(
      "group flex items-center gap-1 rounded-[18px] pr-1 transition",
      active
        ? "bg-white/12 text-white ring-1 ring-white/12 shadow-[0_22px_40px_-30px_rgba(15,23,42,0.95)]"
        : "hover:bg-white/7",
    )}
  >
    <button
      type="button"
      onClick={onSelect}
      className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-3 py-2 text-left"
    >
      {session.is_pinned ? (
        <Pin className={cn("h-3.5 w-3.5 shrink-0", active ? "text-white/85" : "text-slate-400")} />
      ) : (
        <WorkspaceIcon className={cn("h-3.5 w-3.5 shrink-0", active ? "text-white/80" : "text-slate-400")} />
      )}

      {isRenaming ? (
        <input
          autoFocus
          value={renameValue}
          onBlur={onRenameSubmit}
          onChange={(event) => onRenameChange(event.target.value)}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Enter") {
              event.preventDefault();
              onRenameSubmit();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              onCancelRename();
            }
          }}
          className={cn(
            "w-full rounded-xl border bg-transparent px-2 py-1.5 text-sm outline-none",
            active ? "border-white/15 text-white placeholder:text-white/45" : "border-white/10 text-slate-100",
          )}
          placeholder="Renomear conversa"
        />
      ) : (
        <span className={cn("min-w-0 flex-1 truncate text-sm", active ? "text-white" : "text-slate-100/90")}>
          {session.title || "Nova conversa"}
        </span>
      )}
    </button>

    {!isRenaming ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Abrir opcoes de ${session.title || "Nova conversa"}`}
            onClick={(event) => event.stopPropagation()}
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition",
              active
                ? "text-white/75 hover:bg-white/10 hover:text-white"
                : "text-slate-300/60 hover:bg-white/10 hover:text-white",
            )}
          >
            <Ellipsis className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44 rounded-xl border-slate-200/80">
          <DropdownMenuItem onSelect={onStartRename}>
            <Pencil className="mr-2 h-4 w-4" />
            Renomear conversa
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onTogglePin}>
            <Pin className="mr-2 h-4 w-4" />
            {session.is_pinned ? "Desafixar conversa" : "Fixar conversa"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-red-600 focus:text-red-600" onSelect={onDelete}>
            <Trash2 className="mr-2 h-4 w-4" />
            Deletar conversa
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ) : null}
  </div>
);

const AIConversationSidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { sessionId } = useParams<{ sessionId: string }>();
  const [search, setSearch] = useState("");
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const deferredSearch = useDeferredValue(search);
  const isInterpreterWorkspace =
    location.pathname === APP_PATHS.interpreter || location.pathname.startsWith(`${APP_PATHS.interpreter}/`);
  const activeWorkspace = WORKSPACES.find((workspace) => workspace.id === (isInterpreterWorkspace ? "interpreter" : "practice"))!;

  const sessionsQuery = useQuery({
    queryKey: aiStudySessionsQueryKey(deferredSearch, activeWorkspace.modes),
    queryFn: () => fetchAiStudySessions(deferredSearch, activeWorkspace.modes),
  });

  useEffect(() => {
    setSearch("");
    setRenamingSessionId(null);
    setRenameValue("");
  }, [activeWorkspace.id]);

  const sessions = sessionsQuery.data || [];
  const pinnedSessions = sessions.filter((session) => session.is_pinned);
  const otherSessions = sessions.filter((session) => !session.is_pinned);

  const refreshSessions = async (targetSessionId?: string) => {
    await queryClient.invalidateQueries({ queryKey: ["ai-study-sessions"] });
    if (!targetSessionId) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["ai-study-session", targetSessionId] }),
      queryClient.invalidateQueries({ queryKey: ["interpreter-session", targetSessionId] }),
    ]);
  };

  const handleSelectSession = (targetSessionId: string) => {
    startTransition(() => navigate(buildWorkspaceSessionPath(activeWorkspace.id, targetSessionId)));
  };

  const handleStartRename = (session: SessionSummary) => {
    setRenamingSessionId(session.id);
    setRenameValue(session.title || "");
  };

  const handleRenameSubmit = async (session: SessionSummary) => {
    const trimmedTitle = renameValue.trim();
    if (!trimmedTitle || trimmedTitle === session.title) {
      setRenamingSessionId(null);
      setRenameValue("");
      return;
    }

    try {
      await api.post(`/ai-study/sessions/${session.id}/rename/`, { title: trimmedTitle });
      setRenamingSessionId(null);
      setRenameValue("");
      await refreshSessions(session.id);
    } catch {
      toast({
        title: "Nao foi possivel renomear",
        description: "Tente novamente em instantes.",
        variant: "destructive",
      });
    }
  };

  const handleTogglePin = async (session: SessionSummary) => {
    try {
      await api.post(`/ai-study/sessions/${session.id}/pin/`, {
        pinned: !session.is_pinned,
      });
      await refreshSessions(session.id);
    } catch {
      toast({
        title: "Nao foi possivel atualizar a conversa",
        description: "Tente novamente em instantes.",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (session: SessionSummary) => {
    const confirmed = window.confirm(`Excluir a conversa "${session.title || "Nova conversa"}"?`);
    if (!confirmed) return;

    const remainingSessions = sessions.filter((item) => item.id !== session.id);

    try {
      await api.delete(`/ai-study/sessions/${session.id}/`);
      queryClient.removeQueries({ queryKey: ["ai-study-session", session.id] });
      queryClient.removeQueries({ queryKey: ["interpreter-session", session.id] });
      await refreshSessions();

      if (session.id === sessionId) {
        if (remainingSessions.length) {
          startTransition(() => navigate(buildWorkspaceSessionPath(activeWorkspace.id, remainingSessions[0].id)));
        } else {
          navigate(activeWorkspace.newPath);
        }
      }
    } catch {
      toast({
        title: "Nao foi possivel deletar",
        description: "A conversa nao foi removida.",
        variant: "destructive",
      });
    }
  };

  return (
    <section className="rounded-[28px] border border-white/10 bg-white/5 p-4 shadow-[0_20px_40px_-32px_rgba(15,23,42,0.95)]">
      <div className="mb-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
          Workspace IA
        </p>
      </div>

      <div className="space-y-2">
        {WORKSPACES.map((workspace) => {
          const isActive = workspace.id === activeWorkspace.id;
          const WorkspaceIcon = workspace.icon;

          return (
            <div key={workspace.id} className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  if (!isActive) {
                    startTransition(() => navigate(workspace.basePath));
                  }
                }}
                className={cn(
                  "flex w-full items-center gap-3 rounded-[20px] border px-3 py-3 text-left text-sm font-medium transition",
                  isActive
                    ? "border-white/12 bg-[linear-gradient(135deg,#4f7cff,#2d63f5)] text-white shadow-[0_22px_40px_-26px_rgba(45,99,245,0.95)]"
                    : "border-white/10 bg-white/6 text-slate-100/90 hover:bg-white/10",
                )}
              >
                <WorkspaceIcon className="h-[18px] w-[18px] shrink-0" />
                <span className="truncate">{workspace.label}</span>
              </button>

              {isActive ? (
                <div className="ml-4 space-y-3 border-l border-white/10 pl-4">
                  <button
                    type="button"
                    onClick={() => navigate(workspace.newPath)}
                    className="inline-flex w-full items-center gap-2 rounded-2xl border border-white/10 bg-white/8 px-3 py-2.5 text-sm font-medium text-slate-100 transition hover:bg-white/12"
                  >
                    <MessageSquarePlus className="h-4 w-4" />
                    {workspace.createLabel}
                  </button>

                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Buscar conversa"
                      className="w-full rounded-2xl border border-white/10 bg-transparent py-2.5 pl-10 pr-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-sky-300/40 focus:ring-2 focus:ring-sky-300/15"
                    />
                  </div>

                  {sessionsQuery.isLoading ? (
                    <div className="flex items-center gap-2 rounded-xl px-2 py-2 text-sm text-slate-300/80">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Carregando conversas...
                    </div>
                  ) : sessions.length ? (
                    <div className="space-y-3 pb-1">
                      {pinnedSessions.length ? (
                        <div className="space-y-1.5">
                          <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Fixadas</p>
                          {pinnedSessions.map((session) => (
                            <ConversationSidebarItem
                              key={session.id}
                              active={session.id === sessionId}
                              isRenaming={renamingSessionId === session.id}
                              onCancelRename={() => {
                                setRenamingSessionId(null);
                                setRenameValue("");
                              }}
                              onDelete={() => void handleDelete(session)}
                              onRenameChange={setRenameValue}
                              onRenameSubmit={() => void handleRenameSubmit(session)}
                              onSelect={() => handleSelectSession(session.id)}
                              onStartRename={() => handleStartRename(session)}
                              onTogglePin={() => void handleTogglePin(session)}
                              renameValue={renameValue}
                              session={session}
                              workspaceIcon={WorkspaceIcon}
                            />
                          ))}
                        </div>
                      ) : null}

                      {otherSessions.length ? (
                        <div className="space-y-1.5">
                          {pinnedSessions.length ? (
                            <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Conversas</p>
                          ) : null}
                          {otherSessions.map((session) => (
                            <ConversationSidebarItem
                              key={session.id}
                              active={session.id === sessionId}
                              isRenaming={renamingSessionId === session.id}
                              onCancelRename={() => {
                                setRenamingSessionId(null);
                                setRenameValue("");
                              }}
                              onDelete={() => void handleDelete(session)}
                              onRenameChange={setRenameValue}
                              onRenameSubmit={() => void handleRenameSubmit(session)}
                              onSelect={() => handleSelectSession(session.id)}
                              onStartRename={() => handleStartRename(session)}
                              onTogglePin={() => void handleTogglePin(session)}
                              renameValue={renameValue}
                              session={session}
                              workspaceIcon={WorkspaceIcon}
                            />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-white/14 bg-white/6 px-3 py-3 text-sm text-slate-300/80">
                      {workspace.emptyMessage}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default AIConversationSidebar;
