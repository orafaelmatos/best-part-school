import { describe, expect, it } from "vitest";

import {
  isActiveTrailLesson,
  isArchivedLesson,
  isCompletedLesson,
  isUpcomingLesson,
  type LessonHistoryLesson,
} from "@/lib/studentLessonHistory";

const buildLesson = (status: LessonHistoryLesson["status"]): LessonHistoryLesson => ({
  id: `lesson-${status}`,
  title: `Lesson ${status}`,
  status,
});

describe("studentLessonHistory status helpers", () => {
  it("keeps scheduled, in progress, and completed lessons in the active trail", () => {
    expect(isActiveTrailLesson(buildLesson("scheduled"))).toBe(true);
    expect(isActiveTrailLesson(buildLesson("in_progress"))).toBe(true);
    expect(isActiveTrailLesson(buildLesson("completed"))).toBe(true);
  });

  it("removes canceled and missed lessons from the active trail", () => {
    expect(isArchivedLesson(buildLesson("canceled"))).toBe(true);
    expect(isArchivedLesson(buildLesson("missed"))).toBe(true);
    expect(isActiveTrailLesson(buildLesson("canceled"))).toBe(false);
    expect(isActiveTrailLesson(buildLesson("missed"))).toBe(false);
  });

  it("preserves the existing classification for completed and upcoming lessons", () => {
    expect(isCompletedLesson(buildLesson("completed"))).toBe(true);
    expect(isUpcomingLesson(buildLesson("scheduled"))).toBe(true);
    expect(isUpcomingLesson(buildLesson("rescheduled"))).toBe(true);
    expect(isUpcomingLesson(buildLesson("in_progress"))).toBe(true);
  });
});
