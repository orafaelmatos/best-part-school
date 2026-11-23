import type { Page } from "@playwright/test";
// Mocked accounts exist only in this browser test. No product login bypass is used.
export const student = {
  user_id: "mobile-test-student",
  email: "aluno@example.test",
  name: "Ana Silva",
  role: "student",
  level: "A2",
  exp: Math.floor(Date.now() / 1000) + 3600,
};
const access = `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from(JSON.stringify(student)).toString("base64url")}.test`;
const lessonDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
const completedDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
export const lessons = [
  { id: "lesson-1", title: "Everyday conversations", status: "completed", date: completedDate, order: 1, level: "A2", teacher_name: "João", new_words: [], attachments: [] },
  { id: "lesson-2", title: "Talking about your plans", status: "scheduled", date: lessonDate, order: 2, level: "A2", teacher_name: "João", new_words: [], attachments: [], meeting_url: "https://example.test/classroom" },
];
export const homework = {
  id: "homework-1", title: "Practice your daily routine", status: "pending", due_date: lessonDate,
  description: "Revise as expressões da última aula.", lesson: "lesson-1", lesson_title: lessons[0].title,
  classification: "Revisão", teacher_name: "João", auto_correction_enabled: false,
  questions: [{ id: "question-1", type: "open_text", prompt: "Tell us about your daily routine.", options: [], order: 1 }], answers: [],
};
const vocabulary = { due_today: 4, overdue: 2, total_learned_words: 32, total_cards: 32, difficult_cards: 2, mastered_cards: 12, new_cards: 10 };
const practiceSession = {
  id: "session-1", title: "Speaking practice", mode: "speaking", title_source: "auto", is_pinned: false,
  status: "active", message_count: 1, created_at: completedDate, updated_at: completedDate,
  last_interaction_at: completedDate, messages: [{ id: "message-1", role: "assistant", content_type: "text", text: "Hello! Tell me about your plans for this week.", created_at: completedDate }],
};
const practiceSessions = Array.from({ length: 15 }, (_, index) => ({
  ...practiceSession, id: `session-${index + 1}`, title: index === 0 ? practiceSession.title : `Speaking practice ${index + 1}`,
}));

export async function mockStudent(page: Page) {
  await page.addInitScript(({ access }) => {
    localStorage.setItem("token", access);
    localStorage.setItem("refreshToken", "test-only-refresh");
  }, { access });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, "");
    const responses: Record<string, unknown> = {
      "/accounts/ai-consent/": { accepted: false, version: "2026-11-23", accepted_at: null },
      "/lessons/": lessons,
      [`/students/${student.user_id}/lesson-summaries/`]: [],
      "/homework/": [homework],
      "/homework/homework-1/": homework,
      "/vocabulary-cards/dashboard/": vocabulary,
      "/vocabulary-cards/": [],
      "/vocabulary-categories/": [],
      "/ai-study/sessions/": practiceSessions,
      "/ai-study/sessions/session-1/": practiceSession,
      "/ai-study/context-lessons/": [],
      "/ai-study/progress/overview/": { recommendation: null, speaking_history: [], writing_history: [] },
      "/sidebar-badges/": {
        homework: { count: 1, pending_homework: 1, state: "warning" },
        learned_words: { count: 6, overdue_reviews: 2, difficult_cards: 2, state: "warning" },
        finance: { count: 0, state: "none" },
      },
      [`/accounts/users/${student.user_id}/`]: { id: student.user_id, name: student.name, photo_url: null },
    };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(responses[path] ?? []) });
  });
}
