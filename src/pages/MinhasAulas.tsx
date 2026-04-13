import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import DashboardLayout from "@/components/DashboardLayout";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import { ChevronDown, ChevronUp, Download, Play, FileText, Plus } from "lucide-react";

type Filter = "all" | "past" | "upcoming";

const MinhasAulas = () => {
  const [filter, setFilter] = useState<Filter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: lessons = [], isLoading } = useQuery({
    queryKey: ['lessons'],
    queryFn: async () => {
      const res = await api.get('/lessons/');
      return res.data;
    }
  });

  const filtered = lessons.filter((l: any) => {
    if (filter === "past") return l.status === "completed" || l.status === "canceled";
    if (filter === "upcoming") return l.status === "scheduled" || l.status === "rescheduled";
    return true;
  });

  const filters: { label: string; value: Filter }[] = [
    { label: "Todas", value: "all" },
    { label: "Passadas", value: "past" },
    { label: "Próximas", value: "upcoming" },
  ];

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between mb-6">
        <PageHeader title="Minhas Aulas" description="Acompanhe suas aulas, materiais e notas do professor." />
        <Link to="/aulas/nova" className="px-4 py-2 bg-primary text-primary-foreground rounded-lg flex items-center gap-2 font-medium hover:opacity-90">
          <Plus size={18} /> Nova Aula
        </Link>
      </div>

      <div className="flex gap-2 mb-6">
        {filters.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium sidebar-transition ${
              filter === f.value
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-accent"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p>Carregando aulas...</p>
      ) : (
        <div className="space-y-3">
          {filtered.length === 0 && <p className="text-muted-foreground animate-fade-in">Nenhuma aula encontrada.</p>}
          {filtered.map((lesson: any) => {
            const isExpanded = expandedId === lesson.id;
            const dateObj = new Date(lesson.date);

            return (
              <div key={lesson.id} className="border border-border rounded-xl bg-card p-5 sidebar-transition hover:shadow-sm">
                <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : lesson.id)}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-semibold text-card-foreground">{lesson.title}</h3>
                      <StatusBadge status={lesson.status} />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {dateObj.toLocaleDateString("pt-BR")} às {dateObj.toLocaleTimeString("pt-BR", {hour: '2-digit', minute:'2-digit'})} · Nível {lesson.level}
                    </p>
                  </div>
                  {isExpanded ? <ChevronUp size={18} className="text-muted-foreground" /> : <ChevronDown size={18} className="text-muted-foreground" />}
                </div>

                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-border space-y-4 animate-fade-in">
                    {lesson.new_words?.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Novas palavras</p>
                        <div className="flex flex-wrap gap-2">
                          {lesson.new_words.map((nw: any) => (
                            <span key={nw.id} className="px-3 py-1 rounded-full bg-secondary text-secondary-foreground text-xs font-medium">
                              {nw.word}: {nw.meaning}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {lesson.notes && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Notas do professor</p>
                        <p className="text-sm text-card-foreground leading-relaxed">{lesson.notes}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </DashboardLayout>
  );
};

export default MinhasAulas;
