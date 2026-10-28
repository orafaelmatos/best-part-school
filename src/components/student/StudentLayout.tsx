import { useEffect, useRef, useState, type ReactNode } from "react";
import { BookOpen, ChevronLeft, History, House, Layers3, MessageCircle, UserRound } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { APP_PATHS } from "@/lib/routes";
import { absoluteMediaUrl } from "@/lib/config";
import { cn } from "@/lib/utils";
import { useSidebarBadges } from "@/components/SidebarBadges";
import AIConversationSidebar from "@/components/AIConversationSidebar";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { getStudentSection } from "./navigation";
import { studentInitials, useStudentProfile } from "./useStudentProfile";
import "./student.css";

const tabs = [
  { id: "home", label: "Início", path: APP_PATHS.dashboard, icon: House },
  { id: "lessons", label: "Aulas", path: APP_PATHS.lessons, icon: BookOpen },
  { id: "study", label: "Estudar", path: APP_PATHS.study, icon: Layers3 },
  { id: "ai", label: "IA", path: APP_PATHS.aiPractice, icon: MessageCircle },
  { id: "profile", label: "Perfil", path: APP_PATHS.profile, icon: UserRound },
];

const pageTitles: Record<string, string> = {
  [APP_PATHS.lessons]: "Minhas aulas", [APP_PATHS.study]: "Estudar", [APP_PATHS.homework]: "Atividades",
  [APP_PATHS.learnedWords]: "Meu vocabulário", [APP_PATHS.vocabularyGame]: "Jogo de vocabulário",
  [APP_PATHS.profile]: "Meu perfil", [APP_PATHS.finance]: "Financeiro", [APP_PATHS.payments]: "Financeiro",
  [APP_PATHS.marketplace]: "Cursos e materiais",
};

export default function StudentLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyButton = useRef<HTMLButtonElement>(null);
  const { data: profile } = useStudentProfile();
  const { data: badges } = useSidebarBadges();
  const section = getStudentSection(pathname);
  const isHome = section === "home";
  const isAi = section === "ai";
  const isConversation = isAi && pathname.includes("/conversa/");
  const photo = absoluteMediaUrl(profile?.photo_url);
  const title = isAi ? "Seu espaço de IA" : pageTitles[pathname] || "Seus estudos";

  useEffect(() => {
    setHistoryOpen(false);
    // Start a new page at its heading, while chat scrolling remains internal.
    document.scrollingElement?.scrollTo?.({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname]);

  const goBack = () => {
    if (typeof window.history.state?.idx === "number" && window.history.state.idx > 0) navigate(-1);
    else navigate(isAi ? APP_PATHS.aiPractice : APP_PATHS.study);
  };

  return (
    <div className="student-shell" data-student-page={isConversation ? "conversation" : section}>
      <a className="student-skip-link" href="#student-content" onClick={(event) => { event.preventDefault(); document.getElementById("student-content")?.focus(); }}>Ir para o conteúdo</a>
      <header className="student-header">
        <div className="student-header-inner">
          {isHome ? (
            <Link to={APP_PATHS.dashboard} aria-label="Best Part School, início" className="flex min-h-11 items-center gap-2.5">
              <img src="/img/bps-logo.png" alt="" className="h-10 w-10 rounded-xl bg-white object-contain p-1" />
              <span className="leading-tight"><strong className="block text-sm font-bold tracking-tight">best part</strong><span className="text-[10px] font-semibold tracking-[0.22em] text-slate-500">SCHOOL</span></span>
            </Link>
          ) : (
            <div className="flex min-w-0 items-center gap-2">
              {isConversation && <button type="button" onClick={goBack} aria-label="Voltar" className="student-icon-button"><ChevronLeft size={22} /></button>}
              <span className="truncate text-[15px] font-bold">{title}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            {isAi && <button ref={historyButton} type="button" className="student-icon-button" onClick={() => setHistoryOpen(true)} aria-label="Abrir histórico de conversas"><History size={21} /></button>}
            <Link to={APP_PATHS.profile} className="student-avatar" aria-label="Abrir meu perfil">
              {photo ? <img src={photo} alt="" className="h-full w-full object-cover" /> : studentInitials(profile?.name || user?.name)}
            </Link>
          </div>
        </div>
      </header>

      <main id="student-content" className="student-main" tabIndex={-1}>
        {isAi && !isConversation && (
          <nav className="student-ai-tabs" aria-label="Tipo de prática com IA">
            <Link to={APP_PATHS.aiPractice} aria-current={pathname.startsWith(APP_PATHS.aiPractice) ? "page" : undefined}>Conversar e escrever</Link>
            <Link to={APP_PATHS.interpreter} aria-current={pathname.startsWith(APP_PATHS.interpreter) ? "page" : undefined}>Listening</Link>
          </nav>
        )}
        {children}
      </main>

      <nav className="student-bottom-nav" aria-label="Navegação principal do aluno">
        <div className="student-bottom-nav-inner">
          {tabs.map(({ id, label, path, icon: Icon }) => {
            const count = id === "study" ? badges?.homework?.count : 0;
            const active = section === id;
            return (
              <Link key={id} to={path} className={cn("student-tab", active && "is-active")} aria-current={active ? "page" : undefined}>
                <span className="student-tab-icon"><Icon size={22} strokeWidth={active ? 2.3 : 1.8} />{Boolean(count) && <span className="student-tab-badge" aria-label={`${count} atividades pendentes`}>{count > 9 ? "9+" : count}</span>}</span>
                <span>{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent side="bottom" onCloseAutoFocus={(event) => { event.preventDefault(); historyButton.current?.focus(); }} className="mx-auto max-w-2xl rounded-t-[28px] border-0 bg-[#14243a] text-white">
          <SheetHeader className="mb-5 text-left"><SheetTitle className="text-white">Suas conversas</SheetTitle><SheetDescription className="text-slate-300">Retome uma prática ou comece outra.</SheetDescription></SheetHeader>
          {historyOpen && <AIConversationSidebar />}
        </SheetContent>
      </Sheet>
    </div>
  );
}
