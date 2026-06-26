import { api } from "@/lib/api";

export type PracticeMode = "review" | "speaking" | "writing";

export type LessonReference = {
  id: string;
  title: string;
  level: string;
  date?: string | null;
  status?: string;
  teacher_name?: string;
};

export type SessionSummary = {
  id: string;
  mode: PracticeMode;
  title: string;
  title_source: "auto" | "manual";
  status: string;
  lesson?: string | null;
  lesson_detail?: LessonReference | null;
  message_count: number;
  last_interaction_at?: string;
  created_at: string;
  updated_at: string;
};

export type ListResponse<T> =
  | T[]
  | {
      results?: T[];
    };

export const unwrapListResponse = <T,>(data: ListResponse<T> | null | undefined): T[] => {
  if (Array.isArray(data)) return data;
  return Array.isArray(data?.results) ? data.results : [];
};

export const normalizeAiStudySearch = (value: string) => value.trim();

export const aiStudySessionsQueryKey = (search = "") => ["ai-study-sessions", normalizeAiStudySearch(search)] as const;

export const fetchAiStudySessions = async (search = "") => {
  const normalizedSearch = normalizeAiStudySearch(search);
  const params = new URLSearchParams();
  if (normalizedSearch) {
    params.set("search", normalizedSearch);
  }
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const response = await api.get(`/ai-study/sessions/${suffix}`);
  return unwrapListResponse<SessionSummary>(response.data as ListResponse<SessionSummary>);
};

export const buildSessionPath = (sessionId: string) => `/treinar-ia/conversa/${sessionId}`;
export const buildNewModePath = (mode?: PracticeMode) => (mode ? `/treinar-ia?mode=new&practiceMode=${mode}` : "/treinar-ia?mode=new");

export const modeLabel: Record<PracticeMode, string> = {
  review: "Revisar Aula",
  speaking: "Speaking",
  writing: "Writing",
};

export const formatDateTime = (value?: string | null) => {
  if (!value) return "Agora";
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};
