import { afterEach, describe, expect, it, vi } from "vitest";

import type { VocabularyCard } from "@/components/FlashcardReview";
import { buildVocabularyGameRun, maskWordInSentence } from "@/lib/vocabularyGame";

const makeCard = (overrides: Partial<VocabularyCard>): VocabularyCard => ({
  id: overrides.id || crypto.randomUUID(),
  word: overrides.word || "airport",
  translation: overrides.translation || "aeroporto",
  explanation: overrides.explanation || "",
  example_sentence: overrides.example_sentence || "",
  pronunciation: overrides.pronunciation || "",
  tags: overrides.tags || [],
  category_name: overrides.category_name || "Travel",
  custom_category: overrides.custom_category || "",
  audio_url: overrides.audio_url || "",
  audio_file_url: overrides.audio_file_url || "",
  favorite: overrides.favorite || false,
  archived: overrides.archived || false,
  mastered: overrides.mastered || false,
  easiness_factor: overrides.easiness_factor || 2.5,
  interval_days: overrides.interval_days || 0,
  repetition_count: overrides.repetition_count || 0,
  failure_count: overrides.failure_count || 0,
  confidence_level: overrides.confidence_level ?? 30,
  difficulty_level: overrides.difficulty_level || "weak",
  next_review_at: overrides.next_review_at || "2026-08-24T09:00:00.000Z",
  last_reviewed_at: overrides.last_reviewed_at ?? "2026-08-20T09:00:00.000Z",
});

afterEach(() => {
  vi.useRealTimers();
});

describe("maskWordInSentence", () => {
  it("replaces the studied word with underscores", () => {
    expect(maskWordInSentence("Felipe ate too much chocolate and had a stomachache.", "ate")).toBe(
      "Felipe ___ too much chocolate and had a stomachache.",
    );
  });
});

describe("buildVocabularyGameRun", () => {
  it("builds stages, worlds and options from vocabulary cards", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-24T12:00:00.000Z"));

    const run = buildVocabularyGameRun(
      [
        makeCard({
          id: "airport",
          word: "airport",
          translation: "aeroporto",
          example_sentence: "We arrived at the airport before sunrise.",
          confidence_level: 18,
          failure_count: 2,
          difficulty_level: "weak",
          next_review_at: "2026-08-23T09:00:00.000Z",
        }),
        makeCard({
          id: "forecast",
          word: "forecast",
          translation: "previsao",
          example_sentence: "The forecast says it will rain later.",
          confidence_level: 35,
          difficulty_level: "learning",
          last_reviewed_at: null,
          next_review_at: "2026-08-24T13:00:00.000Z",
        }),
        makeCard({
          id: "reservation",
          word: "reservation",
          translation: "reserva",
          example_sentence: "I need to confirm the reservation tonight.",
          confidence_level: 28,
          failure_count: 1,
          difficulty_level: "weak",
          next_review_at: "2026-08-29T09:00:00.000Z",
        }),
        makeCard({
          id: "gate",
          word: "gate",
          translation: "portao",
          confidence_level: 64,
          difficulty_level: "stable",
          failure_count: 0,
          next_review_at: "2026-08-26T09:00:00.000Z",
        }),
        makeCard({
          id: "drizzle",
          word: "drizzle",
          translation: "chuvisco",
          confidence_level: 74,
          difficulty_level: "stable",
          failure_count: 0,
          next_review_at: "2026-08-27T09:00:00.000Z",
        }),
      ],
      "review",
    );

    expect(run.modeLabel).toBe("Revisar hoje");
    expect(run.totalStages).toBe(5);
    expect(run.stages[0].card.word).toBe("airport");
    expect(run.stages[1].type).toBe("sentence");
    expect(run.stages[0].options.some((option) => option.isCorrect && option.text === "airport")).toBe(true);
    expect(run.worlds).toEqual([
      expect.objectContaining({ label: "Campo de Treino", stageCount: 3 }),
      expect.objectContaining({ label: "Floresta de Contexto", stageCount: 2 }),
    ]);
  });
});
