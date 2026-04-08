import { ReactNode } from "react";
import AppSidebar from "./AppSidebar";

const DashboardLayout = ({ children }: { children: ReactNode }) => {
  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <main className="ml-64 p-8">
        {children}
      </main>
    </div>
  );
};

export default DashboardLayout;
