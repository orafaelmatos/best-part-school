import { CalendarClock, CalendarDays, CheckCircle2, CircleDashed, PlayCircle, type LucideIcon } from "lucide-react";

import type { BadgeTone, Tone } from "@/components/student/ui";
import {
  type LessonHistoryLesson,
  type LessonHistorySummary,
  formatLessonDateShort,
  getSummaryPreview,
  isCompletedLesson,
  isUpcomingLesson,
  stripHtml,
} from "@/lib/studentLessonHistory";

export type LessonSegment = "trail" | "upcoming" | "completed";

export const formatStatusLabel = (status: string) => {
  if (status === "completed") return "Concluída";
  if (status === "scheduled") return "Agendada";
  if (status === "rescheduled") return "Reagendada";
  if (status === "in_progress") return "Em andamento";
  if (status === "canceled") return "Cancelada";
  if (status === "missed") return "Perdida";
  return status;
};

export type LessonStatusDisplay = { label: string; icon: LucideIcon; tile: Tone; badge: BadgeTone };

/** Status shown with icon and words, never color alone. */
export const getLessonStatusDisplay = (lesson: LessonHistoryLesson, isNext: boolean): LessonStatusDisplay => {
  if (isCompletedLesson(lesson)) return { label: "Concluída", icon: CheckCircle2, tile: "success", badge: "success" };
  if (lesson.status === "in_progress") return { label: "Em andamento", icon: PlayCircle, tile: "primary", badge: "primary" };
  if (isUpcomingLesson(lesson) && !lesson.date) return { label: "A agendar", icon: CircleDashed, tile: "neutral", badge: "neutral" };
  if (isNext) return { label: "Próxima aula", icon: CalendarClock, tile: "primary", badge: "primary" };
  return { label: formatStatusLabel(lesson.status), icon: CalendarDays, tile: "neutral", badge: "neutral" };
};

export const getLessonOrderLabel = (lesson: LessonHistoryLesson) => {
  if (lesson.is_extra) return "Aula extra";
  if (typeof lesson.order === "number" && lesson.order > 0) return `Aula ${lesson.order}`;
  return "Aula";
};

const parseLessonDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const timeFormatter = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

/** Lessons have no stored end time: the range assumes one hour, as before. */
export const formatLessonTimeRange = (value?: string | null) => {
  const start = parseLessonDate(value);
  if (!start || !value?.includes("T")) return "Horário a combinar";
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return `${timeFormatter.format(start)} – ${timeFormatter.format(end)}`;
};

export const formatLessonStartTime = (value?: string | null) => {
  const start = parseLessonDate(value);
  return start && value?.includes("T") ? timeFormatter.format(start) : "";
};

/** "Quinta-feira, 27 de novembro" */
export const formatLessonLongDate = (value?: string | null) => {
  const date = parseLessonDate(value);
  if (!date) return "Data a definir";
  const text = date.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/** "Aula 2 · 27 de nov. · 19:00" */
export const formatLessonMeta = (lesson: LessonHistoryLesson) => {
  const parts = [getLessonOrderLabel(lesson)];
  if (lesson.date) {
    parts.push(formatLessonDateShort(lesson.date));
    const time = formatLessonStartTime(lesson.date);
    if (time) parts.push(time);
  } else {
    parts.push("Data a definir");
  }
  return parts.join(" · ");
};

export const formatLessonCount = (count: number) => `${count} ${count === 1 ? "aula" : "aulas"}`;

const normalizeForSearch = (value: string) =>
  value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Client-side filter over lessons already loaded. Ignores case and accents. */
export const filterLessonsForSearch = (
  lessons: LessonHistoryLesson[],
  summaryByLesson: Map<string, LessonHistorySummary>,
  searchTerm: string,
) => {
  const query = normalizeForSearch(searchTerm.trim());
  if (!query) return lessons;

  return lessons.filter((lesson) => {
    const summary = summaryByLesson.get(lesson.id);
    const searchableText = [
      lesson.title,
      lesson.level,
      lesson.teacher_name,
      lesson.template_title,
      formatStatusLabel(lesson.status),
      getSummaryPreview(summary),
      stripHtml(lesson.notes),
    ]
      .filter(Boolean)
      .join(" ");
    return normalizeForSearch(searchableText).includes(query);
  });
};
