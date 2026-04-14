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

  const { data = [], isLoading } = useQuery({
    queryKey: ['lessons'],
    queryFn: async () => {
      const res = await api.get('/lessons/');
      return Array.isArray(res.data) ? res.data : (res.data.results || []);
    }
  });

  const lessons = Array.isArray(data) ? data : [];

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
    missed: "bg-purple-500",
  };

  const completedCount = lessons.filter((l: any) => l.status === "completed").length;
  const upcomingCount = lessons.filter((l: any) => l.status === "scheduled" || l.status === "rescheduled").length;
  const missedCount = lessons.filter((l: any) => l.status === "missed").length;

  const upcomingLessons = lessons
    .filter((l: any) => l.status === "scheduled" || l.status === "rescheduled")
    .map((l: any) => new Date(l.date))
    .sort((a: any, b: any) => a - b);

  let periodText = "Nenhuma aula pendente.";
  if (upcomingLessons.length === 1) {
    periodText = upcomingLessons[0].toLocaleDateString("pt-BR");
  } else if (upcomingLessons.length > 1) {
    const first = upcomingLessons[0].toLocaleDateString("pt-BR");
    const last = upcomingLessons[upcomingLessons.length - 1].toLocaleDateString("pt-BR");
    periodText = `${first} até ${last}`;
  }

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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="border border-border rounded-xl p-4 bg-card shadow-sm">
          <p className="text-2xl font-bold text-foreground">{completedCount}</p>
          <p className="text-sm text-muted-foreground">Aulas concluídas</p>
        </div>
        <div className="border border-border rounded-xl p-4 bg-card shadow-sm">
          <p className="text-2xl font-bold text-foreground">{upcomingCount}</p>
          <p className="text-sm text-muted-foreground">Aulas restantes</p>
        </div>
        <div className="border border-border rounded-xl p-4 bg-card shadow-sm col-span-1 md:col-span-1">
          <p className="text-lg font-bold text-foreground mt-1 text-primary">{periodText}</p>
          <p className="text-sm text-muted-foreground mt-1">Período das Próximas Aulas</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 mb-6 px-2 text-xs font-medium text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-success shadow-sm" /> Concluída</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-primary shadow-sm" /> Agendada</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-warning shadow-sm" /> Reagendada</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-destructive shadow-sm" /> Cancelada</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-purple-500 shadow-sm" /> Falta</span>
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
