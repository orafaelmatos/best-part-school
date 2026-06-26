import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import SidebarBadge, { useSidebarBadges } from "./SidebarBadges";
import AIConversationSidebar from "./AIConversationSidebar";
import {
  LayoutDashboard,
  BookOpen,
  Calendar,
  ClipboardList,
  ShoppingBag,
  Bot,
  CreditCard,
  LogOut,
  Users,
  Target,
  MessageSquare
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AI_WORKSPACE_SIDEBAR_WIDTH_CLASS,
  DEFAULT_SIDEBAR_WIDTH_CLASS,
  isAiWorkspacePath,
} from "@/lib/appSidebar";

const AppSidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { data: badges } = useSidebarBadges(user?.role === "student");
  const isAiWorkspace = user?.role === "student" && isAiWorkspacePath(location.pathname);

  const adminTeacherMenuItems = [
    { label: "Painel Geral", icon: LayoutDashboard, path: "/" },
    { label: "Alunos", icon: Users, path: "/alunos" },
    { label: "Homework", icon: ClipboardList, path: "/corrigir-homework" },
    { label: "Calendário", icon: Calendar, path: "/calendario" },
    { label: "CRM", icon: Target, path: "/crm" },
    { label: "Financeiro", icon: CreditCard, path: "/financeiro" },
    { label: "Marketplace", icon: ShoppingBag, path: "/marketplace" },
  ];

  const studentMenuItems = [
    { label: "Meu Painel", icon: LayoutDashboard, path: "/" },
    { label: "Minhas Aulas", icon: BookOpen, path: "/aulas" },
    { label: "Homework", icon: ClipboardList, path: "/homework" },
    { label: "Financeiro", icon: CreditCard, path: "/financeiro" },
    { label: "Marketplace", icon: ShoppingBag, path: "/marketplace" },
    { label: "Praticar com IA", icon: MessageSquare, path: "/treinar-ia" },
  ];

  const menuItems = user?.role === 'student' ? studentMenuItems : adminTeacherMenuItems;

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const getInitials = (name?: string) => {
    if (!name) return "U";
    return name.substring(0, 2).toUpperCase();
  };

  const getRoleLabel = (role?: string) => {
    if (role === "admin") return "Admin";
    if (role === "teacher") return "Professor";
    if (role === "student") return "Aluno";
    return "Usuário";
  };

  const isItemActive = (path: string) => {
    if (path === "/") {
      return location.pathname === "/";
    }

    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  };

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-50 flex h-screen flex-col overflow-hidden border-r border-border bg-sidebar transition-[width] duration-200",
        isAiWorkspace ? AI_WORKSPACE_SIDEBAR_WIDTH_CLASS : DEFAULT_SIDEBAR_WIDTH_CLASS,
      )}
    >
      {/* Logo */}
      <div className="px-6 py-8">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">BPS</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Best Part School</p>
      </div>

      {/* Navigation */}
      <nav className={cn("px-3 space-y-0.5", isAiWorkspace ? "flex-none" : "flex-1 overflow-y-auto")}>
        {menuItems.map((item) => {
          const isActive = isItemActive(item.path);
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium sidebar-transition ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent"
              }`}
            >
              <item.icon size={18} strokeWidth={1.8} />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.label === "Homework" && <SidebarBadge count={badges?.homework.count} state={badges?.homework.state} />}
              {item.label === "Financeiro" && <SidebarBadge count={badges?.finance.count} state={badges?.finance.state} />}
            </NavLink>
          );
        })}
      </nav>

      {isAiWorkspace ? (
        <div className="min-h-0 flex-1 px-3 pb-4 pt-4">
          <AIConversationSidebar />
        </div>
      ) : null}

      {/* User */}
      <div className="p-4 border-t border-border">
        {user && (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 flex-shrink-0 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-semibold">
              {getInitials(user.email)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{user.email}</p>
              <p className="text-xs text-muted-foreground">{getRoleLabel(user.role)}</p>
            </div>
          </div>
        )}
        <button 
          onClick={handleLogout}
          className="mt-3 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground sidebar-transition w-full px-1"
        >
          <LogOut size={16} strokeWidth={1.8} />
          Sair
        </button>
      </div>
    </aside>
  );
};

export default AppSidebar;
