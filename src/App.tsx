import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "./contexts/AuthContext";
import PrivateRoute from "./components/PrivateRoute";
import Login from "./pages/Login";
import LandingPage from "./pages/LandingPage";
import Dashboard from "./pages/Dashboard";
import MinhasAulas from "./pages/MinhasAulas";
import Calendario from "./pages/Calendario";
import Marketplace from "./pages/Marketplace";
import AssistenteIA from "./pages/AssistenteIA";
import Pagamentos from "./pages/Pagamentos";
import NotFound from "./pages/NotFound";
import CriarAula from "./pages/CriarAula";
import AnotarAula from "./pages/AnotarAula";
import CriarCurso from "./pages/CriarCurso";
import Alunos from "./pages/Alunos";
import AlunoTrilha from "./pages/AlunoTrilha";
import CriarAluno from "./pages/CriarAluno";
import CRM from "./pages/CRM";
import Homework from "./pages/Homework";
import PalavrasAprendidas from "./pages/PalavrasAprendidas";
import CorrigirHomework from "./pages/CorrigirHomework";
import InterpreteIA from "./pages/InterpreteIA";
import { APP_PATHS, LANDING_PATH, LOGIN_PATH } from "./lib/routes";

const queryClient = new QueryClient();

const RedirectToPath = ({ to }: { to: string }) => {
  const location = useLocation();
  return <Navigate to={`${to}${location.search}${location.hash}`} replace />;
};

const RedirectToDynamicPath = ({
  buildTo,
}: {
  buildTo: (params: Readonly<Record<string, string | undefined>>) => string;
}) => {
  const location = useLocation();
  const params = useParams();
  return <Navigate to={`${buildTo(params)}${location.search}${location.hash}`} replace />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path={LANDING_PATH} element={<LandingPage />} />
            <Route path={LOGIN_PATH} element={<Login />} />

            <Route path="/alunos" element={<RedirectToPath to={APP_PATHS.students} />} />
            <Route path="/alunos/novo" element={<RedirectToPath to={APP_PATHS.newStudent} />} />
            <Route path="/alunos/:id/aulas" element={<RedirectToDynamicPath buildTo={(params) => APP_PATHS.studentLessons(params.id || "")} />} />
            <Route path="/alunos/:id/trilha" element={<RedirectToDynamicPath buildTo={(params) => APP_PATHS.studentTrack(params.id || "")} />} />
            <Route path="/aulas" element={<RedirectToPath to={APP_PATHS.lessons} />} />
            <Route path="/aulas/nova" element={<RedirectToPath to={APP_PATHS.newLesson} />} />
            <Route path="/aulas/:id/anotar" element={<RedirectToDynamicPath buildTo={(params) => APP_PATHS.annotateLesson(params.id || "")} />} />
            <Route path="/homework" element={<RedirectToPath to={APP_PATHS.homework} />} />
            <Route path="/palavras-aprendidas" element={<RedirectToPath to={APP_PATHS.learnedWords} />} />
            <Route path="/corrigir-homework" element={<RedirectToPath to={APP_PATHS.correctHomework} />} />
            <Route path="/crm" element={<RedirectToPath to={APP_PATHS.crm} />} />
            <Route path="/calendario" element={<RedirectToPath to={APP_PATHS.calendar} />} />
            <Route path="/marketplace" element={<RedirectToPath to={APP_PATHS.marketplace} />} />
            <Route path="/cursos/novo" element={<RedirectToPath to={APP_PATHS.newCourse} />} />
            <Route path="/treinar-ia" element={<RedirectToPath to={APP_PATHS.aiPractice} />} />
            <Route path="/treinar-ia/conversa/:sessionId" element={<RedirectToDynamicPath buildTo={(params) => APP_PATHS.aiPracticeSession(params.sessionId || "")} />} />
            <Route path="/interprete-ia" element={<RedirectToPath to={APP_PATHS.interpreter} />} />
            <Route path="/interprete-ia/conversa/:sessionId" element={<RedirectToDynamicPath buildTo={(params) => APP_PATHS.interpreterSession(params.sessionId || "")} />} />
            <Route path="/financeiro" element={<RedirectToPath to={APP_PATHS.finance} />} />
            <Route path="/pagamentos" element={<RedirectToPath to={APP_PATHS.payments} />} />
            
            <Route element={<PrivateRoute />}>
              <Route path={APP_PATHS.dashboard} element={<Dashboard />} />
              <Route path={APP_PATHS.students} element={<Alunos />} />
              <Route path={APP_PATHS.newStudent} element={<CriarAluno />} />
              <Route path={`${APP_PATHS.students}/:id/aulas`} element={<AlunoTrilha />} />
              <Route path={`${APP_PATHS.students}/:id/trilha`} element={<AlunoTrilha />} />
              <Route path={APP_PATHS.lessons} element={<MinhasAulas />} />
              <Route path={APP_PATHS.homework} element={<Homework />} />
              <Route path={APP_PATHS.learnedWords} element={<PalavrasAprendidas />} />
              <Route path={APP_PATHS.correctHomework} element={<CorrigirHomework />} />
              <Route path={APP_PATHS.crm} element={<CRM />} />
              <Route path={APP_PATHS.newLesson} element={<CriarAula />} />
              <Route path={`${APP_PATHS.lessons}/:id/anotar`} element={<AnotarAula />} />
              <Route path={APP_PATHS.calendar} element={<Calendario />} />
              <Route path={APP_PATHS.marketplace} element={<Marketplace />} />
              <Route path={APP_PATHS.newCourse} element={<CriarCurso />} />
              <Route path={APP_PATHS.aiPractice} element={<AssistenteIA />} />
              <Route path={`${APP_PATHS.aiPractice}/conversa/:sessionId`} element={<AssistenteIA />} />
              <Route path={APP_PATHS.interpreter} element={<InterpreteIA />} />
              <Route path={`${APP_PATHS.interpreter}/conversa/:sessionId`} element={<InterpreteIA />} />
              <Route path={APP_PATHS.finance} element={<Pagamentos />} />
              <Route path={APP_PATHS.payments} element={<Pagamentos />} />
            </Route>
            
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
