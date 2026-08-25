import { api } from "@/lib/api";
import { APP_PATHS } from "@/lib/routes";

export type PracticeMode = "review" | "speaking" | "writing";
export type AIStudyMode = PracticeMode | "listening";

export type LessonReference = {
  id: string;
  title: string;
  level: string;
  date?: string | null;
  status?: string;
  teacher_name?: string;
};

export type GuidedChoice = {
  id: string;
  label: string;
  value: string;
  action_type: string;
  emoji?: string;
  description?: string;
  variant?: string;
};

export type GuidedAssessmentState = {
  questions?: Array<{
    id: string;
    prompt: string;
    helper_text?: string;
  }>;
  answers?: Array<{
    question_id: string;
    answer: string;
  }>;
  current_index?: number;
};

export type GuidedListeningJourneyStep = {
  id: string;
  label: string;
  prompt?: string;
};

export type GuidedListeningJourney = {
  steps?: GuidedListeningJourneyStep[];
  current_step_index?: number;
  completed_step_ids?: string[];
  current_step_status?: string;
};

export type GuidedState = {
  enabled?: boolean;
  stage?: string;
  scenario_key?: string;
  scenario_label?: string;
  level?: string;
  level_source?: string;
  objective?: string;
  difficulty?: string;
  learned_words?: string[];
  recurring_errors?: string[];
  progress_summary?: string;
  recommended_next_step?: string;
  completed_activities?: string[];
  assessment?: GuidedAssessmentState;
  current_task?: string;
  expected_input?: string;
  input_placeholder?: string;
  last_activity_type?: string;
  session_status?: string;
  summary_items?: string[];
  preserve_level_on_scenario_change?: boolean;
  default_level_hint?: string;
  listening_journey?: GuidedListeningJourney;
};

export type SessionSummary = {
  id: string;
  mode: AIStudyMode;
  title: string;
  title_source: "auto" | "manual";
  is_pinned: boolean;
  status: string;
  lesson?: string | null;
  lesson_detail?: LessonReference | null;
  message_count: number;
  guided_state?: GuidedState;
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

export const aiStudySessionsQueryKey = (search = "", modes?: AIStudyMode[]) =>
  ["ai-study-sessions", normalizeAiStudySearch(search), (modes || []).join(",")] as const;

export const fetchAiStudySessions = async (search = "", modes?: AIStudyMode[]) => {
  const normalizedSearch = normalizeAiStudySearch(search);
  const params = new URLSearchParams();
  if (normalizedSearch) {
    params.set("search", normalizedSearch);
  }
  if (modes?.length) {
    params.set("modes", modes.join(","));
  }
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const response = await api.get(`/ai-study/sessions/${suffix}`);
  return unwrapListResponse<SessionSummary>(response.data as ListResponse<SessionSummary>);
};

export const buildSessionPath = (sessionId: string) => APP_PATHS.aiPracticeSession(sessionId);

export const buildNewModePath = (mode?: PracticeMode) => {
  const searchParams = new URLSearchParams({ mode: "new" });
  if (mode) {
    searchParams.set("practiceMode", mode);
  }

  return `${APP_PATHS.aiPractice}?${searchParams.toString()}`;
};

export const buildInterpreterSessionPath = (sessionId: string) => APP_PATHS.interpreterSession(sessionId);

export const modeLabel: Record<AIStudyMode, string> = {
  review: "Revisar Aula",
  speaking: "Speaking",
  listening: "Interprete IA",
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
