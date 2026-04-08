import DashboardLayout from "@/components/DashboardLayout";
import PageHeader from "@/components/PageHeader";
import { BookOpen, Calendar, Trophy, TrendingUp } from "lucide-react";
import { lessons } from "@/data/mockData";

const Dashboard = () => {
  const completedCount = lessons.filter((l) => l.status === "completed").length;
  const upcomingCount = lessons.filter((l) => l.status === "upcoming").length;
  const nextLesson = lessons.find((l) => l.status === "upcoming");

  return (
    <DashboardLayout>
      <PageHeader title="Meu Painel" description="Bem-vindo de volta, Lucas! 👋" />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Aulas concluídas", value: completedCount, icon: BookOpen },
          { label: "Aulas restantes", value: upcomingCount, icon: Calendar },
          { label: "Sequência atual", value: "12 dias", icon: TrendingUp },
          { label: "Conquistas", value: "5", icon: Trophy },
        ].map((stat) => (
          <div key={stat.label} className="border border-border rounded-xl p-5 bg-card">
            <div className="flex items-center justify-between mb-3">
              <stat.icon size={18} className="text-muted-foreground" />
            </div>
            <p className="text-2xl font-bold text-foreground">{stat.value}</p>
            <p className="text-sm text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </div>

      {nextLesson && (
        <div className="border border-border rounded-xl p-6 bg-card">
          <h2 className="font-semibold text-foreground mb-1">Próxima aula</h2>
          <p className="text-muted-foreground text-sm mb-2">{nextLesson.title}</p>
          <p className="text-sm text-muted-foreground">
            {new Date(nextLesson.date).toLocaleDateString("pt-BR")} às {nextLesson.time} · Prof. {nextLesson.teacher}
          </p>
        </div>
      )}
    </DashboardLayout>
  );
};

export default Dashboard;
