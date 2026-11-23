import type { LessonHistoryLesson } from './studentLessonHistory';

export type SchoolUser = {
  id: string; name?: string; email: string; role: 'student' | 'teacher' | 'admin'; level?: string;
  photo_url?: string; listening?: number; speaking?: number; reading?: number; writing?: number;
  completed_lessons?: number; completedLessons?: number; finished_lessons?: number; finishedLessons?: number;
  planned_lessons_count?: number; completed_lessons_count?: number;
  effective_planned_lessons_count?: number; effective_completed_lessons_count?: number; pending_lessons_count?: number;
  contract_start_date?: string; contract_end_date?: string; learning_goal?: string;
  taught_content?: string; content_to_teach?: string; strengths?: string; weaknesses?: string;
  recurring_schedules?: RecurringSchedule[]; student_groups?: string[];
  finance_profile?: { monthly_fee?: string | number; due_day?: number; notes?: string; contract_name?: string; contract_url?: string };
};
export type RecurringSchedule = {
  id: string; teacher?: string | null; group?: string | null; day_of_week: number; start_time: string; active: boolean;
};
export type SchoolLesson = LessonHistoryLesson & {
  is_template?: boolean; template?: string | null; group_student_names?: string[]; group_student_ids?: string[];
};
export type AvailabilitySlot = { day_of_week: number; start: string; end: string };
export type LessonSelectOption = { value: string; label: string; title?: string; level?: string; isNew?: boolean; __isNew__?: boolean };
export type PaymentRecord = {
  id: string; student: string; teacher: string; student_name?: string; teacher_name?: string;
  amount: number | string; due_date?: string; status: string; reference_month?: string;
  payment_method?: string; paid_at?: string; notes?: string;
};
export type FinanceTimelineEntry = { id: string; title: string; description?: string; event_type: string; created_at: string };
export type FinancialSettings = { default_monthly_fee?: number | string; default_due_day?: number };

export function normalizeList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === 'object' && 'results' in data && Array.isArray(data.results)) return data.results as T[];
  return [];
}
