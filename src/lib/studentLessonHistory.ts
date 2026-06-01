export type LessonWordStatus = "hard" | "medium" | "easy" | null | undefined;

export type LessonWord = {
  id: string;
  word: string;
  meaning: string;
  status?: LessonWordStatus;
};

export type LessonAttachment = {
  id: string;
  file_url: string;
  file_name?: string;
  is_image?: boolean;
  mime_type?: string;
};

export type LessonHistoryLesson = {
  id: string;
  title: string;
  level?: string;
  date?: string | null;
  status: string;
  notes?: string;
  meeting_url?: string;
  recording_url?: string;
  teacher?: string;
  teacher_name?: string;
  student?: string;
  student_name?: string;
  template_title?: string;
  order?: number | null;
  new_words?: LessonWord[];
  attachments?: LessonAttachment[];
};

export type LessonHistoryHomework = {
  id: string;
  title: string;
  description?: string;
  classification?: string;
  status: "draft" | "pending" | "sent" | "corrected";
  due_date?: string | null;
  teacher_feedback?: string;
  lesson?: string;
  lesson_title?: string;
};

export type LessonHistorySummaryWord = {
  id: string;
  word: string;
  meaning: string;
};

export type LessonHistorySummaryMistake = {
  id: string;
  mistake: string;
  correction: string;
};

export type LessonHistorySummaryTopic = {
  id: string;
  topic: string;
};

export type LessonHistorySummaryFlashcard = {
  id: string;
  word: string;
  translation: string;
  difficulty_level?: string;
  next_review_at?: string;
};

export type LessonHistorySummary = {
  id: string;
  lesson: string;
  summary: string;
  homework: string;
  observations: string;
  words: LessonHistorySummaryWord[];
  mistakes: LessonHistorySummaryMistake[];
  next_topics: LessonHistorySummaryTopic[];
  flashcards: LessonHistorySummaryFlashcard[];
};

const UPCOMING_STATUSES = ["scheduled", "rescheduled", "in_progress"];
const ARCHIVED_STATUSES = ["canceled", "missed"];

export const isUpcomingLesson = (lesson: LessonHistoryLesson) =>
  UPCOMING_STATUSES.includes(lesson.status);

export const isCompletedLesson = (lesson: LessonHistoryLesson) =>
  lesson.status === "completed";

export const isArchivedLesson = (lesson: LessonHistoryLesson) =>
  ARCHIVED_STATUSES.includes(lesson.status);

export const getLessonDateValue = (value?: string | null) => {
  if (!value) {
    return Number.MAX_SAFE_INTEGER;
  }

  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
};

export const sortLessonsByDateAsc = <T extends LessonHistoryLesson>(lessons: T[]) =>
  [...lessons].sort((left, right) => getLessonDateValue(left.date) - getLessonDateValue(right.date));

export const sortLessonsByDateDesc = <T extends LessonHistoryLesson>(lessons: T[]) =>
  [...lessons].sort((left, right) => getLessonDateValue(right.date) - getLessonDateValue(left.date));

export const formatLessonDate = (value?: string | null, options?: Intl.DateTimeFormatOptions) => {
  if (!value) {
    return "Sem data agendada";
  }

  return new Date(value).toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...options,
  });
};

export const formatLessonDateShort = (value?: string | null) => {
  if (!value) {
    return "Sem data";
  }

  return new Date(value).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
};

export const stripHtml = (value?: string) => {
  if (!value) {
    return "";
  }

  if (typeof document === "undefined") {
    return value.replace(/<[^>]+>/g, " ");
  }

  const element = document.createElement("div");
  element.innerHTML = value;
  return element.textContent || element.innerText || "";
};

export const getSummaryPreview = (summary?: LessonHistorySummary | null) => {
  const clean = stripHtml(summary?.summary);
  if (!clean.trim()) {
    return "";
  }
  return clean.length > 180 ? `${clean.slice(0, 177)}...` : clean;
};

export const getReviewPendingCount = (
  lesson: LessonHistoryLesson,
  summary?: LessonHistorySummary | null,
) => {
  const dueFlashcards = (summary?.flashcards || []).filter((card) => {
    if (!card.next_review_at) {
      return true;
    }

    const nextReview = new Date(card.next_review_at).getTime();
    return Number.isNaN(nextReview) || nextReview <= Date.now();
  });

  if (dueFlashcards.length > 0) {
    return dueFlashcards.length;
  }

  return (lesson.new_words || []).filter((word) => word.status !== "easy").length;
};

export const getOpenHomeworkCount = (homeworkItems: LessonHistoryHomework[]) =>
  homeworkItems.filter((item) => item.status !== "draft" && item.status !== "corrected").length;

export const getPendingHomeworkCount = (homeworkItems: LessonHistoryHomework[]) =>
  homeworkItems.filter((item) => item.status === "pending").length;

export const countLearnedWords = (lessons: LessonHistoryLesson[]) =>
  lessons.reduce((total, lesson) => total + (lesson.new_words?.length || 0), 0);
