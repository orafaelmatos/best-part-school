import type { SpeakingFeedback } from "@/components/PronunciationFeedback";

export const speakingFeedbackFixture = (): SpeakingFeedback => ({
  id: "oral-feedback", transcript: "I would like a coffee, please, with no sugar, with milk.", audio_url: "/student-original.webm",
  overall_score: null, estimated_level: "", pronunciation_score: null, fluency_score: null, intonation_score: null, clarity_score: null,
  ai_feedback: "Sua frase funciona. Vamos organizar o pedido de uma forma mais natural?",
  corrected_sentence: "I would like a coffee, please, with no sugar, with milk.",
  natural_sentence: "I'd like a coffee with milk, but no sugar, please.",
  native_alternative_sentence: "Can I have a coffee with milk and no sugar, please?",
  correct_words: [], problem_words: [], pronunciation_mistakes: [], grammar_explanation: "A construção está correta.",
  improvement_tips: [], practice_exercises: [], vocabulary_suggestions: [], tts_audio_url: null,
  learning_feedback: {
    feedback_version: 1, summary: "Sua frase funciona. Vamos organizar o pedido de uma forma mais natural?",
    suggested_sentence: "I'd like a coffee with milk, but no sugar, please.",
    suggested_translation: "Eu gostaria de um café com leite, mas sem açúcar, por favor.",
    full_sentence: "I'd like a coffee with milk, but no sugar, please.",
    full_translation: "Eu gostaria de um café com leite, mas sem açúcar, por favor.",
    chunks: ["I'd like a coffee with milk,", "but no sugar, please."], feedback_language: "pt-BR",
    comments: ["Você fez o pedido usando uma construção válida.", "Juntamos as informações para evitar repetir with."],
    grammar: { status: "correct", explanation: "A construção está correta." },
    naturalness: { status: "alternative", explanation: "A sugestão organiza as informações." },
    pronunciation: { status: "not_assessed", source: "transcript", score: null, explanation: "Pronúncia não avaliada. Sons, sílabas tônicas, ritmo e entonação precisam de análise do áudio." },
    changes: [{ before: "I would like a coffee, please, with no sugar, with milk.", after: "I'd like a coffee with milk, but no sugar, please.",
      kind: "naturalness", explanation: "Organizamos as informações para evitar repetir with." }],
    needs_clarification: false, clarification_question: "", comparison: "",
  },
});
