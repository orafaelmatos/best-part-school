import { useQuery } from "@tanstack/react-query";
import { Calendar, CheckCircle2 } from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import PageHeader from "@/components/PageHeader";
import StudentHome from "@/components/student/StudentHome";
import WordSentenceComposer from "@/components/WordSentenceComposer";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";

type StaffLesson = { status?: string };

const Dashboard = () => {
  const { user } = useAuth();
  if (user?.role === "student") {
    return <DashboardLayout><StudentHome /><div className="mt-8"><WordSentenceComposer /></div></DashboardLayout>;
  }
  return <StaffDashboard />;
};

const StaffDashboard = () => {
  const { data: lessons = [] } = useQuery<StaffLesson[]>({
    queryKey: ["lessons"],
    queryFn: async () => {
      const res = await api.get("/lessons/");
      return (Array.isArray(res.data) ? res.data : res.data.results || []) as StaffLesson[];
    },
  });

  const completedCount = lessons.filter((lesson) => lesson.status === "completed").length;
  const scheduledCount = lessons.filter((lesson) => lesson.status === "scheduled" || lesson.status === "rescheduled").length;

  return (
    <DashboardLayout>
      <PageHeader
        title="Painel Geral"
        description="Acompanhe rapidamente o andamento das aulas."
      />

      <div className="grid gap-4 md:grid-cols-2">
        <SummaryBlock
          icon={CheckCircle2}
          label="Aulas concluidas"
          value={completedCount}
          note="registradas no sistema"
        />
        <SummaryBlock
          icon={Calendar}
          label="Aulas agendadas"
          value={scheduledCount}
          note="previstas para os proximos dias"
        />
      </div>
    </DashboardLayout>
  );
};

const SummaryBlock = ({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: typeof CheckCircle2;
  label: string;
  value: number | string;
  note: string;
}) => (
  <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_14px_30px_-28px_rgba(15,23,42,0.22)]">
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-medium text-slate-600">{label}</span>
      <Icon className="h-4 w-4 text-sky-700" />
    </div>
    <p className="mt-3 text-2xl font-bold text-foreground">{value}</p>
    <p className="mt-1 text-sm text-muted-foreground">{note}</p>
  </div>
);

export default Dashboard;
