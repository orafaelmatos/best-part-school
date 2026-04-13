import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const Calendario = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedLesson, setSelectedLesson] = useState<any | null>(null);

  const { data: lessons = [], isLoading } = useQuery({
    queryKey: ['lessons'],
    queryFn: async () => {
      const res = await api.get('/lessons/');
      return res.data;
    }
  });

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const prev = () => setCurrentDate(new Date(year, month - 1, 1));
  const next = () => setCurrentDate(new Date(year, month + 1, 1));

  const getLessonsForDay = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return lessons.filter((l: any) => l.date.split("T")[0] === dateStr);
  };

  const statusDot: Record<string, string> = {
    completed: "bg-success",
    scheduled: "bg-primary",
    rescheduled: "bg-warning",
    canceled: "bg-destructive",
  };

  const completedCount = lessons.filter((l: any) => l.status === "completed").length;
  const upcomingCount = lessons.filter((l: any) => l.status === "scheduled").length;

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(<div key={`empty-${i}`} />);
  for (let day = 1; day <= daysInMonth; day++) {
    const dayLessons = getLessonsForDay(day);
    cells.push(
      <div
        key={day}
        onClick={() => dayLessons.length > 0 && setSelectedLesson(dayLessons[0])}
        className={`relative p-2 h-20 rounded-lg border border-border text-sm sidebar-transition ${
          dayLessons.length > 0 ? "cursor-pointer hover:bg-accent" : ""
        }`}
      >
        <span className="text-card-foreground font-medium">{day}</span>
        <div className="flex gap-1 mt-1">
          {dayLessons.map((l: any) => (
            <span key={l.id} className={`w-2 h-2 rounded-full ${statusDot[l.status]}`} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <DashboardLayout>
      <PageHeader title="Calendário" description="Visualize suas aulas no calendário." />

      <div className="grid grid-cols-2 gap-4 mb-8 max-w-md">
        <div className="border border-border rounded-xl p-4 bg-card">
          <p className="text-2xl font-bold text-foreground">{completedCount}</p>
          <p className="text-sm text-muted-foreground">Aulas concluídas</p>
        </div>
        <div className="border border-border rounded-xl p-4 bg-card">
          <p className="text-2xl font-bold text-foreground">{upcomingCount}</p>
          <p className="text-sm text-muted-foreground">Aulas restantes</p>
        </div>
      </div>

      <div className="flex gap-4 mb-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-success" /> Concluída</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-warning" /> Reagendada</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-destructive" /> Cancelada</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-primary" /> Agendada</span>
      </div>

      {isLoading ? <p>Carregando calendário...</p> : (
        <div className="border border-border rounded-xl bg-card p-6">
          <div className="flex items-center justify-between mb-6">
            <button onClick={prev} className="p-2 rounded-lg hover:bg-accent sidebar-transition"><ChevronLeft size={18} /></button>
            <h2 className="text-lg font-semibold text-card-foreground capitalize">
              {currentDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
            </h2>
            <button onClick={next} className="p-2 rounded-lg hover:bg-accent sidebar-transition"><ChevronRight size={18} /></button>
          </div>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {DAYS.map((d) => (
              <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">{cells}</div>
        </div>
      )}

      {selectedLesson && (
        <div className="fixed inset-0 bg-foreground/20 z-50 flex items-center justify-center p-4" onClick={() => setSelectedLesson(null)}>
          <div className="bg-card rounded-2xl shadow-lg p-6 max-w-md w-full animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-semibold text-lg text-card-foreground">{selectedLesson.title}</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {new Date(selectedLesson.date).toLocaleDateString("pt-BR")}
                </p>
              </div>
              <button onClick={() => setSelectedLesson(null)} className="p-1 rounded-lg hover:bg-accent sidebar-transition">
                <X size={18} />
              </button>
            </div>
            <div className="flex items-center gap-2 mb-4">
              <StatusBadge status={selectedLesson.status} />
            </div>
            {selectedLesson.notes && (
              <p className="text-sm text-card-foreground leading-relaxed">{selectedLesson.notes}</p>
            )}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
};
export default Calendario;
