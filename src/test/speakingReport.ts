import type { SpeakingReport } from "@/lib/aiStudy";

export const speakingReportFixture = (): SpeakingReport => ({
  version: 1, run_id: "run-1", scenario: "Aula de Jiu-Jitsu", level: "A1", generated_at: "2026-10-30T15:00:00Z", status: "completed",
  pronunciation_assessed: false,
  phrases_used: [{ answer: "My name is Gabriel.", evidence: "Gabriel", source: "transcript", message_id: "answer-1", phase: "SIMULATE", question: "What's your name?", observation: "adequate" }],
  vocabulary: [{ expression: "My name is", translation: "Meu nome é", example: "My name is Ana.", example_translation: "Meu nome é Ana.", attempts: 1, successful_uses: 1, evidence: ["My name is Gabriel."] }],
  difficulties: [{ detail: "Use My name is.", kind: "struggling", occurrences: 2, evidence: ["I name", "I name"] }],
  recurring_errors: [{ detail: "Use My name is.", kind: "struggling", occurrences: 2, evidence: ["I name", "I name"] }],
  strengths: [{ text: "Resposta adequada ao contexto.", evidence: "Gabriel", source: "transcript" }],
  recommendations: [{ text: "Retome este ponto com seu professor: Use My name is.", evidence: "I name" }],
  progress: { evaluated_responses: 3, successful_responses: 1, activities_completed: 1, situations_completed: 1,
    completed_phases: ["LEARN", "PRACTICE", "SIMULATE"],
    situations: [{ id: "intro", label: "Conhecer o professor", objective: "Se apresentar", completed: true, completed_step_ids: ["name"], total_steps: 3 }] },
  limitations: ["Feedback sobre conteúdo escrito ou transcrito. Pronúncia não avaliada."],
});
