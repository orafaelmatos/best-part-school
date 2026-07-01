export const LANDING_PATH = "/";
export const LOGIN_PATH = "/login";
export const APP_BASE_PATH = "/app";

const withAppBase = (path = "") => {
  if (!path || path === "/") {
    return APP_BASE_PATH;
  }

  return `${APP_BASE_PATH}${path.startsWith("/") ? path : `/${path}`}`;
};

export const APP_PATHS = {
  dashboard: withAppBase(),
  students: withAppBase("/alunos"),
  newStudent: withAppBase("/alunos/novo"),
  studentLessons: (studentId: string) => withAppBase(`/alunos/${studentId}/aulas`),
  studentTrack: (studentId: string) => withAppBase(`/alunos/${studentId}/trilha`),
  lessons: withAppBase("/aulas"),
  newLesson: withAppBase("/aulas/nova"),
  annotateLesson: (lessonId: string) => withAppBase(`/aulas/${lessonId}/anotar`),
  homework: withAppBase("/homework"),
  learnedWords: withAppBase("/palavras-aprendidas"),
  correctHomework: withAppBase("/corrigir-homework"),
  crm: withAppBase("/crm"),
  calendar: withAppBase("/calendario"),
  marketplace: withAppBase("/marketplace"),
  newCourse: withAppBase("/cursos/novo"),
  aiPractice: withAppBase("/treinar-ia"),
  aiPracticeSession: (sessionId: string) => withAppBase(`/treinar-ia/conversa/${sessionId}`),
  interpreter: withAppBase("/interprete-ia"),
  interpreterSession: (sessionId: string) => withAppBase(`/interprete-ia/conversa/${sessionId}`),
  finance: withAppBase("/financeiro"),
  payments: withAppBase("/pagamentos"),
} as const;
