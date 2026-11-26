import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Check } from "lucide-react";
import { api } from "@/lib/api";
import { Badge, Button, SearchBar, inputClasses } from "@/components/student/ui";
import { cn } from "@/lib/utils";

export type LessonContextOption = {
  id: string;
  title: string;
  level: string;
  date?: string | null;
  teacher?: string;
  teacher_name?: string;
  category?: string;
  tags?: string[];
  vocabulary_count?: number;
};

const formatDate = (value?: string | null) => {
  if (!value) return "Sem data";
  return new Date(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
};

const LessonContextSelector = ({
  selectedIds,
  onChange,
  onSave,
  disabled,
}: {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  onSave: () => void;
  disabled?: boolean;
}) => {
  const [query, setQuery] = useState("");
  const [teacher, setTeacher] = useState("all");
  const [category, setCategory] = useState("all");
  const [tag, setTag] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: lessons = [], isLoading } = useQuery({
    queryKey: ["ai-study-context-lessons", dateFrom, dateTo, teacher, category, tag],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      if (teacher !== "all") params.set("teacher", teacher);
      if (category !== "all") params.set("category", category);
      if (tag !== "all") params.set("tag", tag);
      const res = await api.get(`/ai-study/context-lessons/?${params.toString()}`);
      return Array.isArray(res.data) ? res.data : (res.data.results || []);
    },
  });

  const teachers = useMemo<[string, string][]>(() => {
    const pairs = lessons
      .filter((lesson: LessonContextOption) => lesson.teacher)
      .map((lesson: LessonContextOption) => [lesson.teacher || "", lesson.teacher_name || "Professor"] as [string, string]);
    return Array.from(new Map<string, string>(pairs).entries());
  }, [lessons]);

  const categories = useMemo<string[]>(() => Array.from(new Set<string>(lessons.map((lesson: LessonContextOption) => lesson.category || lesson.level).filter(Boolean))), [lessons]);
  const tags = useMemo<string[]>(() => Array.from(new Set<string>(lessons.flatMap((lesson: LessonContextOption) => lesson.tags || []))), [lessons]);

  const filteredLessons = useMemo(() => {
    const lowerQuery = query.toLowerCase();
    return lessons.filter((lesson: LessonContextOption) => (
      !lowerQuery ||
      lesson.title.toLowerCase().includes(lowerQuery) ||
      lesson.level.toLowerCase().includes(lowerQuery) ||
      (lesson.teacher_name || "").toLowerCase().includes(lowerQuery)
    ));
  }, [lessons, query]);

  const toggleLesson = (id: string) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((item) => item !== id) : [...selectedIds, id]);
  };

  return (
    <aside className="rounded-xl border border-line bg-surface p-4 text-ink">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-h4 text-ink">Minhas aulas</h3>
          <p className="mt-0.5 text-body text-ink-secondary">Selecione aulas anteriores para contextualizar o estudo.</p>
        </div>
        <Button type="button" size="sm" onClick={onSave} disabled={disabled}>Salvar</Button>
      </div>

      <div className="space-y-3">
        <SearchBar label="Buscar aulas" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar aulas…" />
        <div className="grid gap-2 sm:grid-cols-2">
          <input type="date" aria-label="Data inicial" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className={inputClasses} />
          <input type="date" aria-label="Data final" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className={inputClasses} />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <select aria-label="Professor" value={teacher} onChange={(event) => setTeacher(event.target.value)} className={inputClasses}>
            <option value="all">Todos os professores</option>
            {teachers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <select aria-label="Categoria" value={category} onChange={(event) => setCategory(event.target.value)} className={inputClasses}>
            <option value="all">Todas as categorias</option>
            {categories.map((item) => <option key={String(item)} value={String(item)}>{String(item)}</option>)}
          </select>
          <select aria-label="Tag" value={tag} onChange={(event) => setTag(event.target.value)} className={inputClasses}>
            <option value="all">Todas as tags</option>
            {tags.map((item) => <option key={String(item)} value={String(item)}>{String(item)}</option>)}
          </select>
        </div>
      </div>

      <div className="mt-4 max-h-96 space-y-2 overflow-y-auto">
        {isLoading ? (
          <p role="status" className="text-body text-ink-secondary">Carregando aulas…</p>
        ) : filteredLessons.length === 0 ? (
          <p className="text-body text-ink-secondary">Nenhuma aula encontrada.</p>
        ) : (
          filteredLessons.map((lesson: LessonContextOption) => {
            const selected = selectedIds.includes(lesson.id);
            return (
              <button
                type="button"
                key={lesson.id}
                aria-pressed={selected}
                onClick={() => toggleLesson(lesson.id)}
                className={cn(
                  "w-full rounded-lg border p-3 text-left transition-colors duration-150 ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  selected ? "border-primary bg-primary-subtle" : "border-line bg-surface hover:bg-surface-muted",
                )}
              >
                <div className="flex items-start gap-3">
                  <span className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-xs border", selected ? "border-primary bg-primary text-primary-foreground" : "border-line bg-surface")} aria-hidden="true">
                    {selected && <Check size={14} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body font-medium text-ink">{lesson.title}</p>
                    <p className="mt-1 flex items-center gap-1 text-caption text-ink-secondary">
                      <CalendarDays size={14} aria-hidden="true" /> {formatDate(lesson.date)} · {lesson.teacher_name || "Professor"}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {lesson.level ? <Badge>{lesson.level}</Badge> : null}
                      <Badge>{lesson.vocabulary_count || 0} cards</Badge>
                    </div>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
};

export default LessonContextSelector;
