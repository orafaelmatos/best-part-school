import type { SessionSummary } from "@/lib/aiStudy";

export type InterpreterSettings = {
  direction: "en_pt" | "pt_en" | "alternating";
  interpretation_mode: "consecutive" | "guided" | "simultaneous";
  segment_duration_seconds?: number;
  playback_speed?: number;
  session_style: "journey" | "free";
  duration_minutes: number;
  prepare_vocabulary: boolean;
  realistic: boolean;
};
export type SimultaneousSegment = {
  recording_start_seconds: number;
  recording_end_seconds: number;
  source_start_seconds: number;
  source_end_seconds: number;
  playback_rate: number;
};
export type SimultaneousTiming = {
  version: 1;
  source_duration_seconds: number;
  recording_duration_seconds: number;
  source_completed: boolean;
  segments: SimultaneousSegment[];
};
export type InterpretationTurn = {
  index: number;
  step_index: number;
  speaker: string;
  source_language: "en" | "pt";
  target_language: "en" | "pt";
  transcript: string;
  suggested_interpretation: string;
  key_information: string[];
  hint: string;
  alternatives: string[];
  correct_option_index: number;
  audio_url?: string | null;
  suggested_audio_url?: string | null;
  review_of?: string;
};
export type InterpretationFeedback = {
  challenge_id: string;
  original_id: string;
  response_mode: "voice" | "text" | "multiple_choice";
  summary: string;
  meaning_score: number;
  completeness_score: number;
  naturalness_score: number | null;
  target_language_observed: boolean;
  information: Array<{ unit_index: number; status: "preserved" | "omitted" | "altered"; evidence: string; explanation: string }>;
  strengths: string[];
  improvements: string[];
  difficult_vocabulary: string[];
};
export type InterpreterReport = {
  interpreted_segments: number;
  oral_segments: number;
  simultaneous_segments?: number;
  meaning_score: number | null;
  completeness_score: number | null;
  naturalness_score: number | null;
  preserved: Array<{ text: string; evidence: string; explanation: string; challenge_id: string }>;
  omitted: InterpreterReport["preserved"];
  altered: InterpreterReport["preserved"];
  difficult_vocabulary: string[];
  recommendations: string[];
  difficult_segments: Array<{ challenge_id: string; label: string }>;
};
export type InterpreterState = {
  version: number;
  settings: InterpreterSettings;
  level: string;
  policy: { words: number; speed: number; support: "full" | "light" | "minimal"; complexity: string };
  plan: {
    situation: string;
    characters: Array<{ name: string; role: string; language: "en" | "pt" }>;
    steps: Array<{ title: string; goal: string }>;
    vocabulary: Array<{ expression: string; translation: string; example: string; example_translation: string }>;
  };
  next_index: number;
  total_turns: number;
  active_turn_id: string | null;
  status: "ready" | "active" | "completed" | "reviewing";
  report: InterpreterReport | null;
};
export type InterpreterMessage = {
  id: string;
  role: string;
  text: string;
  audio_url?: string | null;
  metadata?: {
    interpretation_turn?: InterpretationTurn;
    interpretation_feedback?: InterpretationFeedback;
    interpreter_answer?: { challenge_id: string; response_mode: string; simultaneous_timing?: SimultaneousTiming };
  } | null;
};
export type InterpreterSession = SessionSummary & { messages: InterpreterMessage[] };
export const languageNames = { en: "inglês", pt: "português" };
export const directionNames = { en_pt: "Inglês → Português", pt_en: "Português → Inglês", alternating: "Alternar os dois idiomas" };
export const interpretationModeNames = { consecutive: "Consecutiva", guided: "Treinamento guiado", simultaneous: "Simultânea" };
