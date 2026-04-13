import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Dashboard from "./pages/Dashboard";
import MinhasAulas from "./pages/MinhasAulas";
import Calendario from "./pages/Calendario";
import Marketplace from "./pages/Marketplace";
import AssistenteIA from "./pages/AssistenteIA";
import Pagamentos from "./pages/Pagamentos";
import NotFound from "./pages/NotFound";
import CriarAula from "./pages/CriarAula";
import CriarCurso from "./pages/CriarCurso";
import CriarPagamento from "./pages/CriarPagamento";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/aulas" element={<MinhasAulas />} />
          <Route path="/aulas/nova" element={<CriarAula />} />
          <Route path="/calendario" element={<Calendario />} />
          <Route path="/marketplace" element={<Marketplace />} />
          <Route path="/cursos/novo" element={<CriarCurso />} />
          <Route path="/assistente-ia" element={<AssistenteIA />} />
          <Route path="/pagamentos" element={<Pagamentos />} />
          <Route path="/pagamentos/novo" element={<CriarPagamento />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
