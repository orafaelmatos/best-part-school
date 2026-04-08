import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import { lessons } from "@/data/mockData";
import { ChevronDown, ChevronUp, Download, Play, FileText } from "lucide-react";

type Filter = "all" | "past" | "upcoming";

const MinhasAulas = () => {
  const [filter, setFilter] = useState<Filter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = lessons.filter((l) => {
    if (filter === "past") return l.status === "completed" || l.status === "canceled";
    if (filter === "upcoming") return l.status === "upcoming" || l.status === "rescheduled";
    return true;
  });

  const filters: { label: string; value: Filter }[] = [
    { label: "Todas", value: "all" },
    { label: "Passadas", value: "past" },
    { label: "Próximas", value: "upcoming" },
  ];

  return (
    <DashboardLayout>
      <PageHeader title="Minhas Aulas" description="Acompanhe suas aulas, materiais e notas do professor." />

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

      <div className="space-y-3">
        {filtered.map((lesson) => {
          const isExpanded = expandedId === lesson.id;
          return (
            <div
              key={lesson.id}
              className="border border-border rounded-xl bg-card p-5 sidebar-transition hover:shadow-sm"
            >
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setExpandedId(isExpanded ? null : lesson.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="font-semibold text-card-foreground">{lesson.title}</h3>
                    <StatusBadge status={lesson.status} />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {new Date(lesson.date).toLocaleDateString("pt-BR")} às {lesson.time} · Prof. {lesson.teacher}
                  </p>
                </div>
                {isExpanded ? <ChevronUp size={18} className="text-muted-foreground" /> : <ChevronDown size={18} className="text-muted-foreground" />}
              </div>

              {isExpanded && (
                <div className="mt-4 pt-4 border-t border-border space-y-4 animate-fade-in">
                  {lesson.newWords.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Novas palavras</p>
                      <div className="flex flex-wrap gap-2">
                        {lesson.newWords.map((word) => (
                          <span key={word} className="px-3 py-1 rounded-full bg-secondary text-secondary-foreground text-xs font-medium">
                            {word}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {lesson.teacherNotes && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Notas do professor</p>
                      <p className="text-sm text-card-foreground leading-relaxed">{lesson.teacherNotes}</p>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {lesson.recordingUrl && (
                      <button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium hover:bg-accent sidebar-transition">
                        <Play size={14} /> Gravação
                      </button>
                    )}
                    {lesson.files.map((file) => (
                      <button key={file.name} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium hover:bg-accent sidebar-transition">
                        <FileText size={14} /> {file.name}
                        <Download size={12} />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </DashboardLayout>
  );
};

export default MinhasAulas;
