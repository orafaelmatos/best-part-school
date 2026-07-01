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
    <div className="min-h-screen bg-background text-foreground">
      <AppSidebar />
      <main
        className={cn(
          "relative min-h-screen transition-[margin,padding] duration-200",
          isAiWorkspace ? AI_WORKSPACE_MAIN_OFFSET_CLASS : DEFAULT_MAIN_OFFSET_CLASS,
          isAiWorkspace
            ? "px-4 pb-4 pt-24 sm:px-5 lg:px-6 lg:py-6"
            : "px-4 pb-8 pt-24 sm:px-5 lg:px-8 lg:py-8",
        )}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-64 overflow-hidden">
          <div className="absolute left-[-8%] top-[-7rem] h-56 w-56 rounded-full bg-sky-300/20 blur-3xl" />
          <div className="absolute right-[8%] top-[-5rem] h-52 w-52 rounded-full bg-emerald-300/20 blur-3xl" />
          <div className="school-grid absolute inset-x-0 top-0 h-full opacity-40" />
        </div>

        <div className="relative z-10 mx-auto w-full max-w-[1600px]">{children}</div>
      </main>
    </div>
  );
};

export default DashboardLayout;
