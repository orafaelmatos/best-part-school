import DashboardLayout from "@/components/DashboardLayout";
import PageHeader from "@/components/PageHeader";
import { BookOpen, Calendar, Trophy, TrendingUp } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

const Dashboard = () => {
  const { user } = useAuth();
  
  const { data: lessons = [] } = useQuery({
    queryKey: ['lessons'],
    queryFn: async () => {
      const res = await api.get('/lessons/');
      return Array.isArray(res.data) ? res.data : (res.data.results || []);
    }
  });

  const completedCount = lessons.filter((l: any) => l.status === "completed").length;
  const upcomingLessons = lessons.filter((l: any) => l.status === "scheduled" || l.status === "rescheduled");
  const upcomingCount = upcomingLessons.length;
  const nextLesson = upcomingLessons.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
  
  // Try to use a name from the email
  const name = user?.email?.split('@')[0] || "Usuário";

  return (
    <DashboardLayout>
      <PageHeader 
        title="Meu Painel" 
        description={`Bem-vindo de volta, ${name}! 👋 Role: ${user?.role === "teacher" ? "Professor" : "Aluno"}`} 
      />
      
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
