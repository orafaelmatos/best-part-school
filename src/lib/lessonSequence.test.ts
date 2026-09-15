import { describe, expect, it } from "vitest";

import { isReorderableLesson, type SequenceLesson } from "@/lib/lessonSequence";

const buildLesson = (overrides: Partial<SequenceLesson> = {}): SequenceLesson => ({
  id: "lesson-1",
  title: "Lesson",
  status: "scheduled",
  ...overrides,
});

describe("lesson sequence helpers", () => {
  it("keeps extra lessons out of the reorderable sequence", () => {
    expect(isReorderableLesson(buildLesson())).toBe(true);
    expect(isReorderableLesson(buildLesson({ is_extra: true }))).toBe(false);
  });
});
