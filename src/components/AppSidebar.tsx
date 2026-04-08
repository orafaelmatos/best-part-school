import { NavLink, useLocation } from "react-router-dom";
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
} from "lucide-react";

const menuItems = [
  { label: "Meu Painel", icon: LayoutDashboard, path: "/" },
  { label: "Minhas Aulas", icon: BookOpen, path: "/aulas" },
  { label: "Calendário", icon: Calendar, path: "/calendario" },
  { label: "Marketplace", icon: ShoppingBag, path: "/marketplace" },
  { label: "Assistente IA", icon: Bot, path: "/assistente-ia" },
  { label: "Speaking Practice", icon: Mic, path: "/speaking" },
  { label: "Conquistas", icon: Trophy, path: "/conquistas" },
  { label: "Documentos", icon: FileText, path: "/documentos" },
  { label: "Pagamentos", icon: CreditCard, path: "/pagamentos" },
];

const AppSidebar = () => {
  const location = useLocation();

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
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-semibold">
            LG
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">Lucas Gava Deroldo</p>
            <p className="text-xs text-muted-foreground">Aluno</p>
          </div>
        </div>
        <button className="mt-3 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground sidebar-transition w-full px-1">
          <LogOut size={16} strokeWidth={1.8} />
          Sair
        </button>
      </div>
    </aside>
  );
};

export default AppSidebar;
