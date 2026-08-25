import { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  BookText,
  Calendar,
  ClipboardList,
  CreditCard,
  Gamepad2,
  Headphones,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  ShoppingBag,
  Sparkles,
  Target,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";

import { useAuth } from "../contexts/AuthContext";
import SidebarBadge, { useSidebarBadges } from "./SidebarBadges";
import AIConversationSidebar from "./AIConversationSidebar";
import { cn } from "@/lib/utils";
import {
  AI_WORKSPACE_SIDEBAR_WIDTH_CLASS,
  DEFAULT_SIDEBAR_WIDTH_CLASS,
  isAiWorkspacePath,
} from "@/lib/appSidebar";
import { APP_PATHS, LOGIN_PATH } from "@/lib/routes";

type BadgeKey = "homework" | "learned_words" | "finance";

type MenuItem = {
  label: string;
  icon: LucideIcon;
  path: string;
  badgeKey?: BadgeKey;
};

type MenuSection = {
  label: string;
  items: MenuItem[];
};

type FeaturedMenuItem = {
  label: string;
  description: string;
  eyebrow: string;
  icon: LucideIcon;
  path: string;
  tone: "sky" | "emerald";
};

const ADMIN_TEACHER_MENU_ITEMS: MenuItem[] = [
  { label: "Painel Geral", icon: LayoutDashboard, path: APP_PATHS.dashboard },
  { label: "Alunos", icon: Users, path: APP_PATHS.students },
  { label: "Homework", icon: ClipboardList, path: APP_PATHS.correctHomework },
  { label: "Calendario", icon: Calendar, path: APP_PATHS.calendar },
  { label: "CRM", icon: Target, path: APP_PATHS.crm },
  { label: "Financeiro", icon: CreditCard, path: APP_PATHS.finance },
  { label: "Marketplace", icon: ShoppingBag, path: APP_PATHS.marketplace },
];

const STUDENT_STUDY_MENU_ITEMS: MenuItem[] = [
  { label: "Meu Painel", icon: LayoutDashboard, path: APP_PATHS.dashboard },
  { label: "Minhas Aulas", icon: BookOpen, path: APP_PATHS.lessons },
  { label: "Homework", icon: ClipboardList, path: APP_PATHS.homework, badgeKey: "homework" },
  { label: "Palavras Aprendidas", icon: BookText, path: APP_PATHS.learnedWords, badgeKey: "learned_words" },
  { label: "Jogo de Vocabulario", icon: Gamepad2, path: APP_PATHS.vocabularyGame },
];

const STUDENT_SUPPORT_MENU_ITEMS: MenuItem[] = [
  { label: "Financeiro", icon: CreditCard, path: APP_PATHS.finance, badgeKey: "finance" },
  { label: "Marketplace", icon: ShoppingBag, path: APP_PATHS.marketplace },
];

const STUDENT_FEATURED_AI_ITEMS: FeaturedMenuItem[] = [
  {
    label: "Praticar com IA",
    description: "Revisao, speaking e writing guiados.",
    eyebrow: "Principal",
    icon: MessageSquare,
    path: APP_PATHS.aiPractice,
    tone: "sky",
  },
  {
    label: "Interprete IA",
    description: "Listening guiado com audio e contexto real.",
    eyebrow: "Listening",
    icon: Headphones,
    path: APP_PATHS.interpreter,
    tone: "emerald",
  },
];

const getRoleLabel = (role?: string) => {
  if (role === "admin") return "Admin";
  if (role === "teacher") return "Professor";
  if (role === "student") return "Aluno";
  return "Usuario";
};

const getDisplayName = (name?: string, email?: string) => {
  const normalizedName = name?.trim();
  if (normalizedName) return normalizedName;

  const normalizedEmail = email?.trim();
  if (!normalizedEmail) return "Usuario";

  return normalizedEmail.split("@")[0] || "Usuario";
};

const getInitials = (value?: string) => {
  const normalizedValue = value?.trim();
  if (!normalizedValue) return "U";

  const parts = normalizedValue.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  return normalizedValue.slice(0, 2).toUpperCase();
};

const AppSidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { data: badges } = useSidebarBadges(user?.role === "student");
  const [mobileOpen, setMobileOpen] = useState(false);
  const isAiWorkspace = user?.role === "student" && isAiWorkspacePath(location.pathname);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const menuSections = useMemo<MenuSection[]>(() => {
    if (user?.role === "student") {
      return [
        { label: "Seu estudo", items: STUDENT_STUDY_MENU_ITEMS },
        { label: "Conta", items: STUDENT_SUPPORT_MENU_ITEMS },
      ];
    }

    return [{ label: "Gestao BPS", items: ADMIN_TEACHER_MENU_ITEMS }];
  }, [user?.role]);

  const isItemActive = (path: string) => {
    if (path === APP_PATHS.dashboard) {
      return location.pathname === APP_PATHS.dashboard;
    }

    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  };

  const handleLogout = () => {
    logout();
    navigate(LOGIN_PATH);
  };

  const badgePropsByKey = {
    homework: badges?.homework,
    learned_words: badges?.learned_words,
    finance: badges?.finance,
  };
  const userDisplayName = getDisplayName(user?.name, user?.email);

  const sidebarContent = (
    <SidebarContent
      badgesByKey={badgePropsByKey}
      isAiWorkspace={isAiWorkspace}
      isItemActive={isItemActive}
      isStudent={user?.role === "student"}
      menuSections={menuSections}
      onLogout={handleLogout}
      onNavigate={() => setMobileOpen(false)}
      userName={userDisplayName}
      userInitials={getInitials(userDisplayName)}
      userRoleLabel={getRoleLabel(user?.role)}
    />
  );

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-[rgba(15,23,42,0.92)] px-4 py-3 backdrop-blur lg:hidden">
        <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/12">
              <img src="/img/bps-logo.png" alt="BPS" className="h-7 w-7 object-contain" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Best Part School</p>
              <p className="text-xs text-slate-300">{user?.role === "student" ? "Portal do aluno" : "Painel BPS"}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-white ring-1 ring-white/12 transition hover:bg-white/14"
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-[60] bg-slate-950/65 backdrop-blur-sm lg:hidden">
          <div className="absolute inset-y-0 left-0 flex w-[88vw] max-w-sm flex-col overflow-hidden rounded-r-[30px] border-r border-white/10 bg-[radial-gradient(circle_at_top,#203b71_0%,#18243c_36%,#0f172a_100%)] shadow-[0_30px_80px_-40px_rgba(15,23,42,0.95)]">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-white ring-1 ring-white/12 transition hover:bg-white/14"
              aria-label="Fechar menu"
            >
              <X className="h-4 w-4" />
            </button>
            {sidebarContent}
          </div>
        </div>
      ) : null}

      <aside
        className={cn(
          "hidden lg:fixed lg:left-0 lg:top-0 lg:z-50 lg:flex lg:h-screen lg:flex-col lg:overflow-hidden lg:border-r lg:border-white/10 lg:bg-[radial-gradient(circle_at_top,#203b71_0%,#18243c_36%,#0f172a_100%)] lg:shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_32px_80px_-42px_rgba(15,23,42,0.98)]",
          isAiWorkspace ? AI_WORKSPACE_SIDEBAR_WIDTH_CLASS : DEFAULT_SIDEBAR_WIDTH_CLASS,
        )}
      >
        {sidebarContent}
      </aside>
    </>
  );
};

const SidebarContent = ({
  badgesByKey,
  isAiWorkspace,
  isItemActive,
  isStudent,
  menuSections,
  onLogout,
  onNavigate,
  userName,
  userInitials,
  userRoleLabel,
}: {
  badgesByKey: Record<BadgeKey, { count: number; state: "none" | "default" | "warning" | "danger" } | undefined>;
  isAiWorkspace: boolean;
  isItemActive: (path: string) => boolean;
  isStudent: boolean;
  menuSections: MenuSection[];
  onLogout: () => void;
  onNavigate: () => void;
  userName: string;
  userInitials: string;
  userRoleLabel: string;
}) => (
  <>
    <div className="border-b border-white/10 py-2">
      <div className="rounded-[28px] bg-white/8 p-5 shadow-[0_24px_50px_-40px_rgba(15,23,42,0.95)] backdrop-blur">
        <div className="flex items-center gap-4">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[24px] bg-white p-2 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.7)] ring-1 ring-white/12">
            <img src="/img/bps-logo.png" alt="BPS" className="h-15 w-15 object-contain" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-xl font-semibold text-white">BPS</p>
            <p className="mt-1 text-xs uppercase tracking-[0.28em] text-slate-300">Best Part School</p>
          </div>
        </div>
      </div>
    </div>

    <div className="flex min-h-0 flex-1 flex-col px-4 pb-4 pt-4">
      <div className="hide-scrollbar flex-1 overflow-y-auto pr-1">
        <div className="space-y-5">
          {isStudent && !isAiWorkspace ? (
            <StudentAiHighlights isItemActive={isItemActive} onNavigate={onNavigate} />
          ) : null}

          {isAiWorkspace ? <AIConversationSidebar /> : null}

          {menuSections.map((section) => (
            <div key={section.label} className="space-y-2">
              <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                {section.label}
              </p>
              <nav className="space-y-1.5">
                {section.items.map((item) => (
                  <SidebarLink
                    key={item.path}
                    active={isItemActive(item.path)}
                    badge={item.badgeKey ? badgesByKey[item.badgeKey] : undefined}
                    icon={item.icon}
                    label={item.label}
                    path={item.path}
                    onNavigate={onNavigate}
                  />
                ))}
              </nav>
            </div>
          ))}
        </div>
      </div>
    </div>

    <div className="border-t border-white/10 px-4 pb-4 pt-4">
      <div className="rounded-[28px] bg-white/8 p-3.5 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] bg-white text-sm font-semibold text-slate-900">
            {userInitials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{userName}</p>
            <p className="text-xs text-slate-300">{userRoleLabel}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={onLogout}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/12 bg-white/6 px-3 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-white/12 hover:text-white"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </button>
      </div>
    </div>
  </>
);

const StudentAiHighlights = ({
  isItemActive,
  onNavigate,
}: {
  isItemActive: (path: string) => boolean;
  onNavigate: () => void;
}) => (
  <section className="relative overflow-hidden rounded-[26px] border border-sky-200/20 bg-[linear-gradient(155deg,rgba(59,130,246,0.24),rgba(15,23,42,0.16)_62%,rgba(16,185,129,0.16))] p-3.5 shadow-[0_22px_56px_-44px_rgba(45,99,245,0.88)]">
    <div className="absolute right-[-2rem] top-[-2.5rem] h-24 w-24 rounded-full bg-sky-300/20 blur-3xl" />

    <div className="relative space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-sky-100">
            Estudo com IA
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {STUDENT_FEATURED_AI_ITEMS.map((item) => (
          <FeaturedSidebarLink
            key={item.path}
            active={isItemActive(item.path)}
            description={item.description}
            icon={item.icon}
            label={item.label}
            onNavigate={onNavigate}
            path={item.path}
            tone={item.tone}
          />
        ))}
      </div>
    </div>
  </section>
);

const FeaturedSidebarLink = ({
  active,
  icon: Icon,
  label,
  onNavigate,
  path,
  tone,
}: {
  active: boolean;
  icon: LucideIcon;
  label: string;
  onNavigate: () => void;
  path: string;
  tone: "sky" | "emerald";
}) => {
  const toneClasses = {
    sky: {
      card: active
        ? "border-white/18 bg-white/14 shadow-[0_22px_40px_-30px_rgba(15,23,42,0.95)]"
        : "border-sky-200/25 bg-sky-400/8 hover:bg-sky-400/12",
      icon: active ? "bg-white/16 text-white" : "bg-sky-100/12 text-sky-100",
    },
    emerald: {
      card: active
        ? "border-white/18 bg-white/14 shadow-[0_22px_40px_-30px_rgba(15,23,42,0.95)]"
        : "border-emerald-200/20 bg-emerald-400/7 hover:bg-emerald-400/11",
      icon: active ? "bg-white/16 text-white" : "bg-emerald-100/12 text-emerald-100",
    },
  } as const;

  return (
    <NavLink
      to={path}
      onClick={onNavigate}
      className={cn(
        "group cursor-pointer flex items-center gap-3 rounded-[20px] border px-3 py-3 text-left transition-all duration-200 hover:-translate-y-0.5",
        toneClasses[tone].card,
      )}
    >
      <span
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px] ring-1 ring-white/10 transition",
          toneClasses[tone].icon,
        )}
      >
        <Icon size={18} strokeWidth={1.9} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold leading-5 text-white">{label}</span>
        </span>
      </span>

      <ArrowRight className="h-4 w-4 shrink-0 text-white/65 transition group-hover:translate-x-0.5 group-hover:text-white" />
    </NavLink>
  );
};

const SidebarLink = ({
  active,
  badge,
  icon: Icon,
  label,
  onNavigate,
  path,
}: {
  active: boolean;
  badge?: { count: number; state: "none" | "default" | "warning" | "danger" };
  icon: LucideIcon;
  label: string;
  onNavigate: () => void;
  path: string;
}) => (
  <NavLink
    to={path}
    onClick={onNavigate}
    className={cn(
      "group flex items-center gap-3 rounded-[22px] px-3.5 py-1.5 text-sm font-medium transition-all duration-200",
      active
        ? "bg-white/12 text-white shadow-[0_20px_40px_-34px_rgba(15,23,42,0.95)] ring-1 ring-white/12"
        : "text-slate-200/85 hover:bg-white/7 hover:text-white",
    )}
  >
    <span
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl transition",
        active ? "bg-white/16 text-white" : "bg-white/6 text-slate-300 group-hover:bg-white/10 group-hover:text-white",
      )}
    >
      <Icon size={18} strokeWidth={1.9} />
    </span>
    <span className="min-w-0 flex-1 whitespace-normal break-words leading-5">{label}</span>
    {badge ? <SidebarBadge count={badge.count} state={badge.state} /> : null}
  </NavLink>
);

export default AppSidebar;
