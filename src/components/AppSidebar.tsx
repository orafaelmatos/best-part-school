import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import {
  LayoutDashboard,
  BookOpen,
  Calendar,
  ShoppingBag,
  Bot,
  Mic,
  Trophy,
  FileText,
  CreditCard,
  LogOut,
  Users,
  Target,
  MessageSquare
} from "lucide-react";

const AppSidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const adminTeacherMenuItems = [
    { label: "Painel Geral", icon: LayoutDashboard, path: "/" },
    { label: "Alunos", icon: Users, path: "/alunos" },
    { label: "Aulas", icon: BookOpen, path: "/aulas" },
    { label: "Calendário", icon: Calendar, path: "/calendario" },
    { label: "CRM", icon: Target, path: "/crm" },
    { label: "Marketplace", icon: ShoppingBag, path: "/marketplace" },
  ];

  const studentMenuItems = [
    { label: "Meu Painel", icon: LayoutDashboard, path: "/" },
    { label: "Minhas Aulas", icon: BookOpen, path: "/aulas" },
    { label: "Calendário", icon: Calendar, path: "/calendario" },
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

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 flex flex-col border-r border-border bg-sidebar z-50">
      {/* Logo */}
      <div className="px-6 py-8">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">BPS</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Best Part School</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
        {menuItems.map((item) => {
          const isActive = location.pathname === item.path;
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
              {item.label}
            </NavLink>
          );
        })}
      </nav>

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
