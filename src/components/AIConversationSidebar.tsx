import { startTransition, useDeferredValue, useEffect, useId, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  Ellipsis,
  Headphones,
  MessageSquare,
  MessageSquarePlus,
  Pencil,
  Pin,
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
import { Alert, Button, EmptyState, IconButton, SearchBar, SegmentedControl, Skeleton, inputClasses } from "@/components/student/ui";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import {
  AIStudyMode,
  aiStudySessionsQueryKey,
  buildInterpreterSessionPath,
  buildNewModePath,
  buildSessionPath,
  fetchAiStudySessions,
  formatDateTime,
  modeLabel,
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

// Labels match the shell switch ("Conversar e escrever" / "Listening").
const WORKSPACES: WorkspaceConfig[] = [
  {
    id: "practice",
    label: "Conversar e escrever",
    basePath: APP_PATHS.aiPractice,
    newPath: buildNewModePath(),
    modes: ["review", "speaking", "writing"],
    icon: MessageSquare,
    emptyMessage: "Nenhuma conversa salva ainda.",
    createLabel: "Nova conversa",
  },
  {
    id: "interpreter",
    label: "Listening",
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
}) => {
  const id = useId();
  const title = session.title || "Nova conversa";
  const ItemIcon = session.is_pinned ? Pin : WorkspaceIcon;

  return (
    <li className={cn("flex items-center gap-1 pr-2 transition-colors duration-150 ease-standard", active ? "bg-primary-subtle" : "bg-surface")}>
      {isRenaming ? (
        <div className="flex min-w-0 flex-1 items-center gap-3 py-2 pl-4">
          <ItemIcon size={20} className="shrink-0 text-ink-muted" aria-hidden="true" />
          <input
            autoFocus
            aria-label="Novo nome da conversa"
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
            className={inputClasses}
            placeholder="Renomear conversa"
          />
        </div>
      ) : (
        // The accessible name is the title alone; mode and date are the description.
        <button
          type="button"
          onClick={onSelect}
          aria-current={active ? "true" : undefined}
          aria-labelledby={`${id}-title`}
          aria-describedby={`${id}-meta`}
          className="flex min-h-16 min-w-0 flex-1 items-center gap-3 py-3 pl-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
        >
          <ItemIcon size={20} className={cn("shrink-0", active ? "text-primary" : "text-ink-muted")} aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span id={`${id}-title`} className={cn("block truncate text-body font-medium", active ? "text-primary-dark" : "text-ink")}>{title}</span>
            <span id={`${id}-meta`} className={cn("mt-0.5 block truncate text-caption", active ? "text-ink" : "text-ink-secondary")}>
              {modeLabel[session.mode]}{session.last_interaction_at ? ` · ${formatDateTime(session.last_interaction_at)}` : ""}
            </span>
          </span>
        </button>
      )}

      {!isRenaming ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton
              variant="ghost"
              aria-label={`Abrir opções de ${title}`}
              icon={<Ellipsis aria-hidden="true" />}
              onClick={(event) => event.stopPropagation()}
              className="size-11 shrink-0 text-ink-secondary"
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 rounded-lg border-line bg-surface p-1 text-ink shadow-overlay">
            <DropdownMenuItem className="min-h-11 gap-2 rounded-md text-body" onSelect={onStartRename}>
              <Pencil size={16} aria-hidden="true" />
              Renomear conversa
            </DropdownMenuItem>
            <DropdownMenuItem className="min-h-11 gap-2 rounded-md text-body" onSelect={onTogglePin}>
              <Pin size={16} aria-hidden="true" />
              {session.is_pinned ? "Desafixar conversa" : "Fixar conversa"}
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-line" />
            <DropdownMenuItem className="min-h-11 gap-2 rounded-md text-body text-danger focus:text-danger" onSelect={onDelete}>
              <Trash2 size={16} aria-hidden="true" />
              Excluir conversa
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </li>
  );
};

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
    startTransition(() => { void navigate(buildWorkspaceSessionPath(activeWorkspace.id, targetSessionId)); });
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
        title: "Não foi possível renomear",
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
        title: "Não foi possível atualizar a conversa",
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
          startTransition(() => { void navigate(buildWorkspaceSessionPath(activeWorkspace.id, remainingSessions[0].id)); });
        } else {
          navigate(activeWorkspace.newPath);
        }
      }
    } catch {
      toast({
        title: "Não foi possível excluir",
        description: "A conversa não foi removida.",
        variant: "destructive",
      });
    }
  };

  const renderItems = (items: SessionSummary[]) => (
    <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
      {items.map((session) => (
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
          workspaceIcon={activeWorkspace.icon}
        />
      ))}
    </ul>
  );

  return (
    <div className="space-y-4 pb-2 text-ink">
      <SegmentedControl<WorkspaceId>
        label="Tipo de prática"
        value={activeWorkspace.id}
        items={WORKSPACES.map((workspace) => ({ value: workspace.id, label: workspace.label }))}
        onChange={(value) => {
          const workspace = WORKSPACES.find((item) => item.id === value);
          if (workspace && workspace.id !== activeWorkspace.id) {
            startTransition(() => { void navigate(workspace.basePath); });
          }
        }}
      />

      <Button type="button" variant="secondary" fullWidth onClick={() => navigate(activeWorkspace.newPath)}>
        <MessageSquarePlus aria-hidden="true" />
        {activeWorkspace.createLabel}
      </Button>

      <SearchBar
        label="Buscar conversa"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Buscar conversa"
      />

      {sessionsQuery.isLoading ? (
        <div role="status" aria-label="Carregando conversas" className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {[0, 1, 2].map((index) => (
            <div key={index} className="flex min-h-16 items-center gap-3 px-4">
              <Skeleton className="size-5 rounded-full" />
              <div className="flex-1 space-y-2"><Skeleton className="h-3.5 w-3/5" /><Skeleton className="h-3 w-2/5" /></div>
            </div>
          ))}
        </div>
      ) : sessionsQuery.isError ? (
        <Alert
          tone="danger"
          role="alert"
          title="Não carregamos suas conversas."
          action={<Button type="button" size="sm" variant="outline" onClick={() => void sessionsQuery.refetch()}>Tentar novamente</Button>}
        >
          Confira sua conexão e tente de novo.
        </Alert>
      ) : sessions.length ? (
        <div className="space-y-4">
          {pinnedSessions.length ? (
            <section aria-labelledby="ai-history-pinned" className="space-y-2">
              <h3 id="ai-history-pinned" className="text-label text-ink-secondary">Fixadas</h3>
              {renderItems(pinnedSessions)}
            </section>
          ) : null}
          {otherSessions.length ? (
            <section aria-labelledby={pinnedSessions.length ? "ai-history-others" : undefined} className="space-y-2">
              {pinnedSessions.length ? <h3 id="ai-history-others" className="text-label text-ink-secondary">Conversas</h3> : null}
              {renderItems(otherSessions)}
            </section>
          ) : null}
        </div>
      ) : (
        <EmptyState
          compact
          icon={activeWorkspace.icon}
          title={search ? "Nenhuma conversa encontrada" : activeWorkspace.emptyMessage}
          description={search ? "Tente buscar por outro nome." : "Comece uma prática e ela aparece aqui."}
        />
      )}
    </div>
  );
};

export default AIConversationSidebar;
