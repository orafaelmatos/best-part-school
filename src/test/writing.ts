import type { WritingActivity, WritingCorrection, WritingReport } from "@/lib/writing";

export const writingActivityFixture = (): WritingActivity => ({
  id: "activity-1", kind: "translate", kind_label: "Traduzir", number: 1, support: "full",
  situation: "Você está planejando uma viagem com um amigo e quer dizer qual cidade vai visitar.",
  objective: "Dizer qual cidade você quer visitar.", structure: "I want to visit…",
  explanation: "I significa eu; want significa quero. Depois de want, usamos to antes de outro verbo.",
  construction: [{ text: "I want", translation: "Eu quero" }, { text: "I want to visit", translation: "Eu quero visitar" },
    { text: "I want to visit New York.", translation: "Eu quero visitar Nova York." }],
  example: { text: "I want to visit New York.", translation: "Eu quero visitar Nova York." },
  vocabulary: [{ text: "visit", translation: "visitar" }, { text: "London", translation: "Londres" }],
  instruction: "Agora diga ao seu amigo: Eu quero visitar Londres. Escreva uma frase em inglês.", words: [],
});

export const writingCorrectionFixture = (): WritingCorrection => ({
  original: "I want visit London.", corrected_text: "I want to visit London.", outcome: "needs_work",
  feedback: "Boa! Sua frase está quase certa. Só faltou uma palavrinha.",
  errors: [{ excerpt: "I want visit", corrected: "I want to visit", category: "Infinitivo",
    explanation: "Depois de want, usamos to antes de outro verbo. Por isso, dizemos want to visit." }],
});

export const writingReportFixture = (): WritingReport => ({
  version: 1, run_id: "run-1", scenario: "Turismo", level: "A1", practice_mode: "Traduzir frases", status: "completed",
  activities_completed: 2, attempts: 2, correct: 1, needs_work: 1,
  structures: ["I want to visit…"], vocabulary: ["visit", "London"],
  difficulties: ["Faltou to entre want e visit."], recommendations: ["Revise want to com outros destinos."],
  responses: [{ original: "I want visit London.", corrected: "I want to visit London.", outcome: "needs_work", activity: "Traduzir",
    instruction: "Diga que quer visitar Londres.", feedback: "Só faltou to.", errors: writingCorrectionFixture().errors }],
});
