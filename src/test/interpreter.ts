import type { InterpreterMessage, InterpreterSession, InterpreterState, InterpretationFeedback } from "@/lib/interpreter";

export const interpreterState: InterpreterState = {
  version: 1, level: "A2", next_index: 1, total_turns: 5, active_turn_id: "turn-1", status: "active", report: null,
  settings: { direction: "en_pt", interpretation_mode: "guided", session_style: "journey", duration_minutes: 5, prepare_vocabulary: false, realistic: false },
  policy: { words: 25, speed: 0.8, support: "full", complexity: "Frases curtas" },
  plan: {
    situation: "Christopher, pastor americano, visita uma igreja no Brasil e precisa de um intérprete.",
    characters: [{ name: "Christopher", role: "Pastor americano", language: "en" }, { name: "Ana", role: "Anfitriã brasileira", language: "pt" }],
    steps: ["Saudação à igreja", "Introdução da mensagem", "Desenvolvimento", "Reflexão", "Encerramento e oração"].map((title) => ({ title, goal: title })),
    vocabulary: [{ expression: "blessing", translation: "bênção", example: "It is a blessing to be here.", example_translation: "É uma bênção estar aqui." }],
  },
};
export const interpreterTurn: InterpreterMessage = { id: "turn-1", role: "assistant", text: "It is a blessing to be here with you tonight.", metadata: { interpretation_turn: {
  speaker: "Christopher", source_language: "en", target_language: "pt", index: 0, step_index: 0,
  transcript: "It is a blessing to be here with you tonight.", suggested_interpretation: "É uma bênção estar aqui com vocês nesta noite.",
  key_information: ["Bênção de estar com o público nesta noite."], hint: "Preserve a ideia de gratidão.", correct_option_index: 0,
  alternatives: ["É uma bênção estar aqui com vocês nesta noite.", "A reunião será amanhã.", "A igreja está fechada.", "Vamos embora agora."], audio_url: "/media/original.mp3",
} } };
export const interpreterFeedback: InterpretationFeedback = {
  challenge_id: "turn-1", original_id: "turn-1", response_mode: "voice", summary: "Muito bem! Você transmitiu a mensagem corretamente.",
  meaning_score: 95, completeness_score: 100, naturalness_score: 95, target_language_observed: true,
  information: [{ unit_index: 0, status: "preserved", evidence: "Que bênção estar com vocês esta noite!", explanation: "Você preservou a mensagem." }],
  strengths: ["Você manteve o significado da fala original."], improvements: [], difficult_vocabulary: [],
};
export const interpreterSession: InterpreterSession = {
  id: "session-v2", student: "preview-student", mode: "listening", title: "Intérprete IA — Pregação", title_source: "auto", is_pinned: false, status: "active", message_count: 1,
  created_at: "2026-11-10T10:00:00Z", updated_at: "2026-11-10T10:00:00Z", guided_state: { level: "A2", scenario_label: "Pregação", interpreter: interpreterState }, messages: [interpreterTurn],
};
