export type SequenceLesson = {
  id: string;
  title: string;
  status: string;
  order?: number | null;
  date?: string | null;
};

const REORDERABLE_STATUSES = ["pending", "scheduled", "rescheduled"];

const orderValue = (lesson: SequenceLesson) => {
  if (typeof lesson.order === "number" && lesson.order > 0) {
    return lesson.order;
  }
  return Number.MAX_SAFE_INTEGER;
};

const dateValue = (lesson: SequenceLesson) => {
  if (!lesson.date) {
    return Number.MAX_SAFE_INTEGER;
  }
  const parsed = new Date(lesson.date).getTime();
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
};

export const isReorderableLesson = (lesson: SequenceLesson) =>
  REORDERABLE_STATUSES.includes(lesson.status);

export const sortLessonsBySequence = <T extends SequenceLesson>(lessons: T[]) =>
  [...lessons].sort((left, right) => {
    const orderDiff = orderValue(left) - orderValue(right);
    if (orderDiff !== 0) {
      return orderDiff;
    }

    const dateDiff = dateValue(left) - dateValue(right);
    if (dateDiff !== 0) {
      return dateDiff;
    }

    return left.title.localeCompare(right.title);
  });

export const formatSequenceOptionLabel = (lesson: SequenceLesson) => {
  const prefix = typeof lesson.order === "number" && lesson.order > 0 ? `${lesson.order}. ` : "";
  const scheduleLabel = lesson.date
    ? new Date(lesson.date).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "sem data";

  return `${prefix}${lesson.title} · ${scheduleLabel}`;
};
