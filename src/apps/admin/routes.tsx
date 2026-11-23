import { Navigate, Route } from "react-router-dom";
import Alunos from "@/pages/Alunos";
import AlunoTrilha from "@/pages/AlunoTrilha";
import CriarAluno from "@/pages/CriarAluno";
import CorrigirHomework from "@/pages/CorrigirHomework";
import CRM from "@/pages/CRM";
import CriarAula from "@/pages/CriarAula";
import AnotarAula from "@/pages/AnotarAula";
import Calendario from "@/pages/Calendario";
import CriarCurso from "@/pages/CriarCurso";
import { APP_PATHS } from "@/lib/routes";

export const adminPaths = [
  APP_PATHS.students, APP_PATHS.newStudent,
  `${APP_PATHS.students}/:id/aulas`, `${APP_PATHS.students}/:id/trilha`,
  APP_PATHS.correctHomework, APP_PATHS.crm, APP_PATHS.newLesson,
  `${APP_PATHS.lessons}/:id/anotar`, APP_PATHS.calendar, APP_PATHS.newCourse,
];

export function adminRoutes({ includeLessonsAlias = true } = {}) {
  return [
    <Route key="students" path={APP_PATHS.students} element={<Alunos />} />,
    <Route key="newStudent" path={APP_PATHS.newStudent} element={<CriarAluno />} />,
    <Route key="studentLessons" path={`${APP_PATHS.students}/:id/aulas`} element={<AlunoTrilha />} />,
    <Route key="studentTrack" path={`${APP_PATHS.students}/:id/trilha`} element={<AlunoTrilha />} />,
    <Route key="correctHomework" path={APP_PATHS.correctHomework} element={<CorrigirHomework />} />,
    <Route key="crm" path={APP_PATHS.crm} element={<CRM />} />,
    <Route key="newLesson" path={APP_PATHS.newLesson} element={<CriarAula />} />,
    <Route key="annotateLesson" path={`${APP_PATHS.lessons}/:id/anotar`} element={<AnotarAula />} />,
    <Route key="calendar" path={APP_PATHS.calendar} element={<Calendario />} />,
    <Route key="newCourse" path={APP_PATHS.newCourse} element={<CriarCurso />} />,
    includeLessonsAlias && <Route key="lessons" path={APP_PATHS.lessons} element={<Navigate to={APP_PATHS.students} replace />} />,
  ];
}
