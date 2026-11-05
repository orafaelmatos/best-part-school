import { api } from "@/lib/api";
import { APP_PATHS } from "@/lib/routes";

export type PracticeMode = "review" | "speaking" | "writing";

export type SpeakingReport = {
  version: number; run_id: string; scenario: string; level: string; generated_at: string;
  status: "active" | "paused" | "situation_completed" | "completed";
  pronunciation_assessed: false;
  phrases_used: Array<{ answer: string; evidence: string; source: string; message_id: string; phase: string; question: string; observation: string }>;
  vocabulary: Array<{ expression: string; translation: string; example: string; example_translation: string; attempts: number; successful_uses: number; evidence: string[] }>;
  difficulties: Array<{ detail: string; kind: string; occurrences: number; evidence: string[] }>;
  recurring_errors: SpeakingReport["difficulties"];
  strengths: Array<{ text: string; evidence: string; source: string }>;
  recommendations: Array<{ text: string; evidence: string }>;
  progress: { evaluated_responses: number; successful_responses: number; activities_completed: number; situations_completed: number;
    situations: Array<{ id: string; label: string; objective: string; total_steps: number; completed_step_ids: string[]; completed: boolean }>; completed_phases: string[] };
  limitations: string[];
};

export type SpeakingReportRecord = {
  id: string; session: string; run_id: string; status: SpeakingReport["status"]; report: SpeakingReport;
  completed_at: string | null; created_at: string; updated_at: string;
};

export const speakingReportStatus: Record<SpeakingReport["status"], string> = {
  active: "Em andamento", paused: "Em pausa", situation_completed: "Situação concluída", completed: "Sessão encerrada",
};

export const speakingCount = (count: number, singular: string, plural: string) => `${count} ${count === 1 ? singular : plural}`;
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

export type SpeakingPhase = "LEARN" | "PRACTICE" | "SIMULATE" | "FEEDBACK";

export type SpeakingTurnContent = {
  feedback: string;
  instruction: string;
  demonstration: string;
  demonstration_translation: string;
  question: string;
  question_translation: string;
  response_starter: string;
  response_starter_translation: string;
};

export type SpeakingHelp = {
  action: string;
  text: string;
  examples: Array<{ text: string; translation: string }>;
};

export type SpeakingVocabularyItem = {
  expression: string;
  translation: string;
  example: string;
  example_translation: string;
};

export type SpeakingGuidedTask = {
  instruction: string;
  question: string;
  question_translation: string;
  model_answer: string;
  model_answer_translation: string;
  hint: string;
};

export type SpeakingVocabularyActivity = {
  step: "WORD" | "EXAMPLE" | "REPEAT" | "FEEDBACK" | "GUIDED" | "COMPLETE";
  item_index: number;
  item: SpeakingVocabularyItem;
  total_items: number;
  completed_count: number;
  review_count: number;
  feedback: string;
  hint: string;
  task: SpeakingGuidedTask | null;
  next: string;
  assessment_source: "text" | "transcript" | null;
  attempts: number;
  max_attempts: number;
  show_translations: boolean;
};

export type SpeakingPedagogicalState = {
  version: number;
  phase: SpeakingPhase;
  situation_id: string;
  plan: {
    situations: Array<{
      id: string;
      label: string;
      context: string;
      ai_role: string;
      student_role: string;
      objective: string;
      sequence: Array<{
        id: string;
        label: string;
        goal: string;
        possible_responses: string[];
        branches: Array<{ learner_intent: string; next_step_id: string }>;
      }>;
      vocabulary: Array<{
        expression: string;
        translation: string;
        example: string;
        example_translation: string;
      }>;
    }>;
  };
  step_index: number;
  completed_step_ids: string[];
  completed_phases: SpeakingPhase[];
  turn_count: number;
  phase_turns: number;
  successful_turns: number;
  consecutive_difficulties: number;
  transition_reason: string;
  last_question: string;
  taught_expressions: string[];
  practiced_vocabulary: string[];
  difficulties: Array<{ phase: SpeakingPhase; evidence: string; kind: string; detail?: string }>;
  help_used: Array<{ action: string; phase: SpeakingPhase; question: string; turn: number }>;
  resume_phase?: SpeakingPhase;
  resume_question?: string;
  simulation?: {
    version: number;
    last_content: {
      feedback: string;
      instruction: string;
      demonstration: string;
      demonstration_translation: string;
      question: string;
      question_translation: string;
      response_starter: string;
      response_starter_translation: string;
    } | null;
    exchanges: Array<{ step_id: string; question: string; answer: string; evidence: string }>;
    branch_history: Array<{ from_step_id: string; to_step_id: string; evidence: string }>;
    success_streak: number;
    support_level: "full" | "light" | "minimal";
    return_point: Record<string, unknown> | null;
    challenge_history: Array<Record<string, unknown>>;
  };
  preparation?: {
    version: number;
    step: SpeakingVocabularyActivity["step"];
    item_index: number;
    attempts: Record<string, number>;
    completed_indices: number[];
    review_indices: number[];
    feedback: string;
    hint: string;
    alternate_example: string;
    alternate_example_translation: string;
    task: SpeakingGuidedTask | null;
    guided_attempts: number;
    guided_successes: number;
    guided_history: string[];
    next: string;
    assessment_source: "text" | "transcript" | null;
  };
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
  speaking?: SpeakingPedagogicalState;
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
