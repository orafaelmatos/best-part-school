import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Check, Search } from "lucide-react";
import { api } from "@/lib/api";

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
    <aside className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">Minhas Aulas</h3>
          <p className="text-xs text-muted-foreground">Selecione aulas anteriores para contextualizar o estudo.</p>
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={disabled}
          className="rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          Salvar
        </button>
      </div>

      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar aulas..."
            className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="rounded-lg border border-border bg-background px-2 py-2 text-xs" />
          <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="rounded-lg border border-border bg-background px-2 py-2 text-xs" />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-1">
          <select value={teacher} onChange={(event) => setTeacher(event.target.value)} className="rounded-lg border border-border bg-background px-2 py-2 text-xs">
            <option value="all">Todos professores</option>
            {teachers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <select value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-lg border border-border bg-background px-2 py-2 text-xs">
            <option value="all">Todas categorias</option>
            {categories.map((item) => <option key={String(item)} value={String(item)}>{String(item)}</option>)}
          </select>
          <select value={tag} onChange={(event) => setTag(event.target.value)} className="rounded-lg border border-border bg-background px-2 py-2 text-xs">
            <option value="all">Todas tags</option>
            {tags.map((item) => <option key={String(item)} value={String(item)}>{String(item)}</option>)}
          </select>
        </div>
      </div>

      <div className="mt-4 max-h-[420px] space-y-2 overflow-y-auto pr-1">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando aulas...</p>
        ) : filteredLessons.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma aula encontrada.</p>
        ) : (
          filteredLessons.map((lesson: LessonContextOption) => {
            const selected = selectedIds.includes(lesson.id);
            return (
              <button
                type="button"
                key={lesson.id}
                onClick={() => toggleLesson(lesson.id)}
                className={`w-full rounded-xl border p-3 text-left transition ${selected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${selected ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>
                    {selected && <Check className="h-3 w-3" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{lesson.title}</p>
                    <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <CalendarDays className="h-3 w-3" /> {formatDate(lesson.date)} · {lesson.teacher_name || "Professor"}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{lesson.level}</span>
                      <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{lesson.vocabulary_count || 0} cards</span>
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
