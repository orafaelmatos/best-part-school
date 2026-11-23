import { Navigate, Route } from "react-router-dom";
import MinhasAulas from "@/pages/MinhasAulas";
import Homework from "@/pages/Homework";
import JogoVocabulario from "@/pages/JogoVocabulario";
import AssistenteIA from "@/pages/AssistenteIA";
import InterpreteIA from "@/pages/InterpreteIA";
import StudentStudy from "@/pages/StudentStudy";
import StudentProfile from "@/pages/StudentProfile";
import { APP_PATHS } from "@/lib/routes";

export const studentPaths = [
  APP_PATHS.study, APP_PATHS.profile,
  APP_PATHS.lessons, APP_PATHS.homework, APP_PATHS.vocabularyGame,
  APP_PATHS.aiPractice, `${APP_PATHS.aiPractice}/conversa/:sessionId`,
  APP_PATHS.interpreter, `${APP_PATHS.interpreter}/conversa/:sessionId`,
];

export function studentRoutes({ includeCalendarAlias = true } = {}) {
  return [
    <Route key="study" path={APP_PATHS.study} element={<StudentStudy />} />,
    <Route key="profile" path={APP_PATHS.profile} element={<StudentProfile />} />,
    <Route key="lessons" path={APP_PATHS.lessons} element={<MinhasAulas />} />,
    <Route key="homework" path={APP_PATHS.homework} element={<Homework />} />,
    <Route key="vocabularyGame" path={APP_PATHS.vocabularyGame} element={<JogoVocabulario />} />,
    <Route key="aiPractice" path={APP_PATHS.aiPractice} element={<AssistenteIA />} />,
    <Route key="aiPracticeSession" path={`${APP_PATHS.aiPractice}/conversa/:sessionId`} element={<AssistenteIA />} />,
    <Route key="interpreter" path={APP_PATHS.interpreter} element={<InterpreteIA />} />,
    <Route key="interpreterSession" path={`${APP_PATHS.interpreter}/conversa/:sessionId`} element={<InterpreteIA />} />,
    // The existing student calendar lives in MinhasAulas. Exclude the staff scheduler.
    includeCalendarAlias && <Route key="calendar" path={APP_PATHS.calendar} element={<Navigate to={APP_PATHS.lessons} replace />} />,
  ];
}
