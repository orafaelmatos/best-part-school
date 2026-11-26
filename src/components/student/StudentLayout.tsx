import { useEffect, useRef, useState, type ReactNode } from "react";
import { History } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "@/contexts/AuthContext";
import { APP_PATHS } from "@/lib/routes";
import { absoluteMediaUrl } from "@/lib/config";
import { useSidebarBadges } from "@/components/SidebarBadges";
import AIConversationSidebar from "@/components/AIConversationSidebar";
import { useStudentTheme } from "@/design-system/theme";
import { BottomSheet, SegmentedControl } from "@/components/student/ui";
import BottomNavigation from "./BottomNavigation";
import ScreenHeader from "./ScreenHeader";
import { getStudentSection } from "./navigation";
import { useStudentProfile } from "./useStudentProfile";
import "./student.css";

const pageTitles: Record<string, string> = {
  [APP_PATHS.lessons]: "Minhas aulas", [APP_PATHS.study]: "Estudar", [APP_PATHS.homework]: "Atividades",
  [APP_PATHS.learnedWords]: "Meu vocabulário", [APP_PATHS.vocabularyGame]: "Jogo de palavras",
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
  useStudentTheme();
  const section = getStudentSection(pathname);
  const isHome = section === "home";
  const isAi = section === "ai";
  const isConversation = isAi && pathname.includes("/conversa/");
  const title = isAi ? "Praticar com IA" : pageTitles[pathname] || "Seus estudos";

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
      <ScreenHeader
        variant={isHome ? "brand" : "title"}
        title={title}
        onBack={isConversation ? goBack : undefined}
        name={profile?.name || user?.name}
        photo={absoluteMediaUrl(profile?.photo_url)}
        actions={isAi && (
          <button ref={historyButton} type="button" className="student-icon-button" onClick={() => setHistoryOpen(true)} aria-label="Abrir histórico de conversas">
            <History size={20} aria-hidden="true" />
          </button>
        )}
      />

      <main id="student-content" className="student-main" tabIndex={-1}>
        {isAi && !isConversation && (
          <SegmentedControl
            label="Tipo de prática com IA"
            className="mb-6"
            value={pathname.startsWith(APP_PATHS.interpreter) ? "listening" : "practice"}
            items={[
              { value: "practice", label: "Conversar e escrever", to: APP_PATHS.aiPractice },
              { value: "listening", label: "Listening", to: APP_PATHS.interpreter },
            ]}
          />
        )}
        {children}
      </main>

      <BottomNavigation section={section} pendingActivities={badges?.homework?.count || 0} />

      <BottomSheet
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        title="Suas conversas"
        description="Retome uma prática ou comece outra."
        onCloseAutoFocus={(event) => { event.preventDefault(); historyButton.current?.focus(); }}
      >
        {historyOpen && <AIConversationSidebar />}
      </BottomSheet>
    </div>
  );
}
