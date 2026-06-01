import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
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
import CorrigirHomework from "./pages/CorrigirHomework";
import { useAuth } from "./contexts/AuthContext";

const queryClient = new QueryClient();

const HomeRoute = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center text-primary font-medium">Carregando BPS...</div>;
  }

  return user ? <Dashboard /> : <LandingPage />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<HomeRoute />} />
            <Route path="/login" element={<Login />} />
            
            <Route element={<PrivateRoute />}>
              <Route path="/alunos" element={<Alunos />} />
              <Route path="/alunos/novo" element={<CriarAluno />} />
              <Route path="/alunos/:id/aulas" element={<AlunoTrilha />} />
              <Route path="/alunos/:id/trilha" element={<AlunoTrilha />} />
              <Route path="/aulas" element={<MinhasAulas />} />
              <Route path="/homework" element={<Homework />} />
              <Route path="/corrigir-homework" element={<CorrigirHomework />} />
              <Route path="/crm" element={<CRM />} />
              <Route path="/aulas/nova" element={<CriarAula />} />
              <Route path="/aulas/:id/anotar" element={<AnotarAula />} />
              <Route path="/calendario" element={<Calendario />} />
              <Route path="/marketplace" element={<Marketplace />} />
              <Route path="/cursos/novo" element={<CriarCurso />} />
              <Route path="/treinar-ia" element={<AssistenteIA />} />
              <Route path="/financeiro" element={<Pagamentos />} />
              <Route path="/pagamentos" element={<Pagamentos />} />
            </Route>
            
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
