import { BookOpen, House, Layers3, Sparkles, UserRound, type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";

import { APP_PATHS } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { iconStroke } from "@/design-system/tokens";

export type StudentSection = "home" | "lessons" | "ai" | "study" | "profile";

type Tab = { id: StudentSection; label: string; path: string; icon: LucideIcon };

const sideTabs: Tab[] = [
  { id: "home", label: "Início", path: APP_PATHS.dashboard, icon: House },
  { id: "lessons", label: "Aulas", path: APP_PATHS.lessons, icon: BookOpen },
  { id: "study", label: "Estudar", path: APP_PATHS.study, icon: Layers3 },
  { id: "profile", label: "Perfil", path: APP_PATHS.profile, icon: UserRound },
];

/** Main student navigation. The AI tutor sits in the center as a raised blue button. */
export default function BottomNavigation({ section, pendingActivities = 0 }: { section: StudentSection; pendingActivities?: number }) {
  const [home, lessons, study, profile] = sideTabs;
  const aiActive = section === "ai";
  return (
    <nav className="student-bottom-nav" aria-label="Navegação principal do aluno">
      <div className="student-bottom-nav-inner">
        <TabLink tab={home} active={section === "home"} />
        <TabLink tab={lessons} active={section === "lessons"} />
        <Link
          to={APP_PATHS.aiPractice}
          aria-label="Praticar com IA"
          aria-current={aiActive ? "page" : undefined}
          className={cn("student-tab student-tab-ai", aiActive && "is-active")}
        >
          <span className="student-tab-ai-button" aria-hidden="true"><Sparkles size={24} strokeWidth={2} /></span>
          <span aria-hidden="true">IA</span>
        </Link>
        <TabLink tab={study} active={section === "study"} count={pendingActivities} countLabel="atividades pendentes" />
        <TabLink tab={profile} active={section === "profile"} />
      </div>
    </nav>
  );
}

function TabLink({ tab, active, count = 0, countLabel }: { tab: Tab; active: boolean; count?: number; countLabel?: string }) {
  const Icon = tab.icon;
  return (
    <Link to={tab.path} className={cn("student-tab", active && "is-active")} aria-current={active ? "page" : undefined}>
      <span className="student-tab-icon">
        <Icon size={24} strokeWidth={active ? 2 : iconStroke} aria-hidden="true" />
        {count > 0 && <span className="student-tab-badge" aria-label={`${count} ${countLabel}`}>{count > 9 ? "9+" : count}</span>}
      </span>
      <span>{tab.label}</span>
    </Link>
  );
}
