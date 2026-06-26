import { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import AppSidebar from "./AppSidebar";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import {
  AI_WORKSPACE_MAIN_OFFSET_CLASS,
  DEFAULT_MAIN_OFFSET_CLASS,
  isAiWorkspacePath,
} from "@/lib/appSidebar";

const DashboardLayout = ({ children }: { children: ReactNode }) => {
  const location = useLocation();
  const { user } = useAuth();
  const isAiWorkspace = user?.role === "student" && isAiWorkspacePath(location.pathname);

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <main
        className={cn(
          "transition-[margin] duration-200",
          isAiWorkspace ? AI_WORKSPACE_MAIN_OFFSET_CLASS : DEFAULT_MAIN_OFFSET_CLASS,
          isAiWorkspace ? "p-5 lg:p-6" : "p-8",
        )}
      >
        {children}
      </main>
    </div>
  );
};

export default DashboardLayout;
