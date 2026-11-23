export type WritingActivity = {
  id: string;
  kind: string;
  kind_label: string;
  situation: string;
  objective: string;
  structure: string;
  explanation: string;
  construction: Array<{ text: string; translation: string }>;
  example: { text: string; translation: string };
  vocabulary: Array<{ text: string; translation: string }>;
  instruction: string;
  words: string[];
  support: "full" | "light";
  number: number;
};

export type WritingCorrection = {
  original: string;
  outcome: "correct" | "needs_work";
  corrected_text: string;
  feedback: string;
  errors: Array<{ excerpt: string; corrected: string; explanation: string; category: string }>;
};

export type WritingHelp = { action: string; label: string; text: string };

export type WritingReport = {
  version: number;
  run_id: string;
  scenario: string;
  level: string;
  practice_mode: string;
  status: "active" | "paused" | "completed";
  activities_completed: number;
  attempts: number;
  correct: number;
  needs_work: number;
  structures: string[];
  vocabulary: string[];
  difficulties: string[];
  recommendations: string[];
  responses: Array<{
    original: string; corrected: string; outcome: "correct" | "needs_work";
    activity: string; instruction: string; feedback: string; errors: WritingCorrection["errors"];
  }>;
};

export type WritingReportRecord = {
  id: string; session: string; run_id: string; status: WritingReport["status"];
  report: WritingReport; completed_at: string | null; created_at: string; updated_at: string;
};

export const writingReportStatus: Record<WritingReport["status"], string> = {
  active: "Em andamento", paused: "Em pausa", completed: "Prática finalizada",
};
