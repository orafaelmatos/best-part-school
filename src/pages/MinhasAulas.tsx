import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import DashboardLayout from "@/components/DashboardLayout";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import { ChevronDown, ChevronUp, Download, Play, FileText, Plus, Book, CheckCircle2, Circle, Video, Trash2, Edit2 } from "lucide-react";
import { curriculumData } from "@/data/curriculum";
import { useAuth } from "@/contexts/AuthContext";

type Filter = "all" | "past" | "upcoming" | "curriculum";
type Level = keyof typeof curriculumData;

const FlashcardItem = ({ nw, isTeacher, isStudent, onEdit, onDelete, onStatusUpdate }: any) => {
  const [flipped, setFlipped] = useState(false);

  const statusColors: Record<string, string> = {
    easy: "border-green-500 bg-green-100/80 dark:bg-green-900/20 shadow-green-200",
    medium: "border-yellow-500 bg-yellow-100/80 dark:bg-yellow-900/20 shadow-yellow-200",
    hard: "border-red-500 bg-red-100/80 dark:bg-red-900/20 shadow-red-200",
    default: "border-primary/20 bg-card",
  };

  const getCardStyle = () => {
    if (nw.status && statusColors[nw.status]) {
      return `${statusColors[nw.status]} border-2`;
    }
    return `${statusColors.default} border`;
  };

  return (
    <div 
      className={`relative group ${getCardStyle()} p-5 rounded-xl shadow-md hover:shadow-lg transition-all cursor-pointer min-h-[140px] flex flex-col justify-center items-center text-center`}
      onClick={() => setFlipped(!flipped)}
    >
      {!flipped ? (
        <div className="w-full h-full flex items-center justify-center">
          <p className="font-bold text-primary text-xl px-2">{nw.word}</p>
        </div>
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-between pointer-events-none">
          <p className="text-base font-medium text-foreground px-2 mb-4 mt-2">{nw.meaning}</p>
          
          {isStudent && (
             <div className="flex gap-2 justify-center pb-1 z-10 w-full pointer-events-auto">
               <button 
                 onClick={(e) => { e.stopPropagation(); onStatusUpdate(nw.id, 'hard'); setFlipped(false); }} 
                 className="flex-1 py-1.5 px-2 bg-red-100 text-red-700 text-xs font-bold rounded hover:bg-red-200 transition-colors border border-red-200"
               >
                 Não Lembrei
               </button>
               <button 
                 onClick={(e) => { e.stopPropagation(); onStatusUpdate(nw.id, 'medium'); setFlipped(false); }} 
                 className="flex-1 py-1.5 px-2 bg-yellow-100 text-yellow-700 text-xs font-bold rounded hover:bg-yellow-200 transition-colors border border-yellow-300"
               >
                 Mais ou menos
               </button>
               <button 
                 onClick={(e) => { e.stopPropagation(); onStatusUpdate(nw.id, 'easy'); setFlipped(false); }} 
                 className="flex-1 py-1.5 px-2 bg-green-100 text-green-700 text-xs font-bold rounded hover:bg-green-200 transition-colors border border-green-300"
               >
                 Fácil
               </button>
             </div>
          )}
        </div>
      )}
      
      {isTeacher && (
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
          <button onClick={() => onEdit(nw)} className="p-1 text-muted-foreground hover:text-primary hover:bg-muted rounded-md" title="Editar">
            <Edit2 size={16} />
          </button>
          <button onClick={() => onDelete(nw.id)} className="p-1 text-muted-foreground hover:text-destructive hover:bg-red-50 rounded-md" title="Excluir">
            <Trash2 size={16} />
          </button>
        </div>
      )}

      {(!flipped && !isStudent) && (
        <div className="absolute bottom-2 text-[10px] text-muted-foreground/50 transition-opacity opacity-60 group-hover:opacity-100">
          Clique para virar o card
        </div>
      )}
    </div>
  );
};

const FlashcardEditor = ({ lesson, refetch }: { lesson: any, refetch: () => void }) => {
  const [word, setWord] = useState('');
  const [meaning, setMeaning] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  
  const isTeacher = user?.role === 'teacher' || user?.role === 'admin';
  const isStudent = user?.role === 'student';

  const handleAddOrEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!word || !meaning) return;
    setLoading(true);
    try {
      if (editingId) {
        await api.patch(`/new-words/${editingId}/`, { word, meaning });
        setEditingId(null);
      } else {
        await api.post("/new-words/", { word, meaning, level: lesson.level, lesson_id: lesson.id });
      }
      setWord(''); setMeaning('');
      refetch();
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar card');
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = (nw: any) => {
    setWord(nw.word);
    setMeaning(nw.meaning);
    setEditingId(nw.id);
  };

  const handleDeleteClick = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este flashcard?')) return;
    try {
      await api.delete(`/new-words/${id}/`);
      refetch();
    } catch (err) {
      console.error(err);
      alert('Erro ao excluir card');
    }
  };

  const handleStatusUpdate = async (id: string, status: string) => {
    try {
      await api.patch(`/new-words/${id}/`, { status });
      refetch();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="bg-muted p-4 rounded-xl space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold flex items-center gap-2 text-sm text-foreground">
          <Book size={16} /> Flashcards (Anki) & Resumo da Aula
        </h4>
      </div>
      
      {lesson.new_words?.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {lesson.new_words.map((nw: any) => (
            <FlashcardItem 
              key={nw.id} 
              nw={nw} 
              isTeacher={isTeacher} 
              isStudent={isStudent}
              onEdit={handleEditClick} 
              onDelete={handleDeleteClick} 
              onStatusUpdate={handleStatusUpdate}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Nenhum card cadastrado ainda.</p>
      )}

      {isTeacher && (
        <form onSubmit={handleAddOrEdit} className="mt-4 pt-4 border-t border-border/50 flex gap-2">
          <input 
            type="text" placeholder="Palavra/Expressão" required
            className="flex-1 p-2 text-sm rounded-lg border border-border bg-background"
            value={word} onChange={e => setWord(e.target.value)}
          />
          <input 
            type="text" placeholder="Significado/Tradução" required
            className="flex-[2] p-2 text-sm rounded-lg border border-border bg-background"
            value={meaning} onChange={e => setMeaning(e.target.value)}
          />
          <button disabled={loading} className="px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg whitespace-nowrap hover:opacity-90">
            {loading ? 'Salvando...' : (editingId ? 'Salvar Edição' : 'Adicionar Card')}
          </button>
          {editingId && (
            <button type="button" onClick={() => { setEditingId(null); setWord(''); setMeaning(''); }} className="px-3 py-2 bg-secondary text-secondary-foreground text-sm font-medium rounded-lg hover:bg-accent whitespace-nowrap">
              Cancelar
            </button>
          )}
        </form>
      )}
    </div>
  );
};

const MinhasAulas = () => {
  const { user } = useAuth();
  const [filter, setFilter] = useState<Filter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedLevel, setSelectedLevel] = useState<Level>("A1/A2");
  const queryClient = useQueryClient();

  const { data = [], isLoading, refetch } = useQuery({
    queryKey: ['lessons'],
    queryFn: async () => {
      const res = await api.get('/lessons/');
      return Array.isArray(res.data) ? res.data : (res.data.results || []);
    }
  });

  const lessons = Array.isArray(data) ? data : [];

  useEffect(() => {
    if (user?.role === 'student' && user?.level) {
      setSelectedLevel(user.level as Level);
    } else if (lessons.length > 0 && user?.role === 'student') {
      setSelectedLevel(lessons[0].level as Level);
    }
  }, [user, lessons.length]);

  const filtered = lessons.filter((l: any) => {
    if (filter === "past") return l.status === "completed" || l.status === "canceled";
    if (filter === "upcoming") return l.status === "scheduled" || l.status === "rescheduled" || l.status === "in_progress";
    if (filter === "all") return l.status !== "pending"; // exclude pending from "all scheduled"
    return true;
  });

  const filters: { label: string; value: Filter }[] = [
    { label: "Todas Agendadas", value: "all" },
    { label: "Passadas", value: "past" },
    { label: "Próximas", value: "upcoming" },
    { label: "Trilha do Curso", value: "curriculum" },
  ];

  const levels: Level[] = ["A1/A2", "B1", "B2", "C1", "C2"];
  const currentCurriculum = curriculumData[selectedLevel];
  const allLevelsCurriculum = curriculumData["ALL LEVELS"];

  const getLessonStatus = (title: string) => {
    const found = lessons.find((l: any) => l.title?.toLowerCase() === title.toLowerCase());
    return found ? found.status : "pending";
  };

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between mb-6">
        <PageHeader title="Minhas Aulas" description="Acompanhe suas aulas, materiais e sua trilha de aprendizado." />
        
        {user?.role === 'teacher' || user?.role === 'admin' ? (
          <Link to="/aulas/nova" className="px-4 py-2 bg-primary text-primary-foreground rounded-lg flex items-center gap-2 font-medium hover:opacity-90">
            <Plus size={18} /> Nova Aula
          </Link>
        ) : null}
      </div>

      <div className="flex gap-2 mb-6 border-b border-border pb-4 overflow-x-auto">
        {filters.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`whitespace-nowrap px-4 py-2 rounded-lg text-sm font-medium sidebar-transition ${
              filter === f.value
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-accent"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filter === "curriculum" ? (
        <div className="animate-fade-in space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h2 className="text-xl font-semibold text-foreground">Sua Trilha de Aprendizado</h2>
            <select
              value={selectedLevel}
              onChange={(e) => setSelectedLevel(e.target.value as Level)}
              disabled={user?.role === 'student'}
              className="bg-card border border-border text-foreground text-sm rounded-lg px-3 py-2 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <optgroup label="Selecione seu Nível">
                {levels.map(lvl => (
                  <option key={lvl} value={lvl}>Nível {lvl}</option>
                ))}
              </optgroup>
            </select>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4 text-primary">
                <Book size={20} />
                <h3 className="text-lg font-semibold">Tópicos das Aulas ({selectedLevel})</h3>
              </div>
              <div className="bg-card border border-border rounded-xl p-0 overflow-hidden shadow-sm">
                {currentCurriculum.lessons.length > 0 ? (
                  <>
                    {Object.entries(
                      currentCurriculum.lessons.reduce((acc: Record<string, string[]>, lessonTitle: string) => {
                         const status = getLessonStatus(lessonTitle);
                         if (status === 'completed') acc['Concluídas'] = [...(acc['Concluídas']||[]), lessonTitle];
                         else if (status === 'scheduled' || status === 'rescheduled' || status === 'in_progress') acc['Agendadas'] = [...(acc['Agendadas']||[]), lessonTitle];
                         else acc['Pendentes a Estudar'] = [...(acc['Pendentes a Estudar']||[]), lessonTitle];
                         return acc;
                      }, {})
                    ).map(([groupName, groupLessons]: [string, string[]]) => (
                      <div key={groupName}>
                        <div className="px-4 py-2 bg-secondary/50 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          {groupName} ({groupLessons.length})
                        </div>
                        {groupLessons.map((lessonTitle) => {
                          const status = getLessonStatus(lessonTitle);
                          return (
                            <div key={lessonTitle} className={`flex items-center justify-between p-4 border-b border-border last:border-0 hover:bg-accent/50 sidebar-transition ${status === 'completed' ? 'opacity-70' : ''}`}>
                              <div className="flex items-center gap-3">
                                {status === 'completed' ? <CheckCircle2 className="text-green-500" size={20} /> : <Circle className="text-muted-foreground/50" size={20} />}
                                <span className={`font-medium ${status === 'completed' ? 'text-muted-foreground line-through' : 'text-card-foreground'}`}>
                                  {lessonTitle}
                                </span>
                              </div>
                              {status !== 'pending' && <StatusBadge status={status} />}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </>
                ) : (
                  <div className="p-6 text-center text-muted-foreground">Nenhuma aula predefinida específica para este nível.</div>
                )}
              </div>
            </div>

            <div className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4 text-purple-500">
                  <FileText size={20} />
                  <h3 className="text-lg font-semibold">Gramática ({selectedLevel})</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {currentCurriculum.grammar.length > 0 ? currentCurriculum.grammar.map((grammar, index) => (
                    <span key={index} className="px-3 py-1.5 rounded-full bg-secondary text-secondary-foreground text-sm font-medium">
                      {grammar}
                    </span>
                  )) : <span className="text-muted-foreground text-sm">Nenhum tópico gramatical específico listado.</span>}
                </div>
              </div>

              <div className="space-y-4 pt-6 border-t border-border">
                <div className="flex items-center gap-2 mb-4 text-blue-500">
                  <Book size={20} />
                  <h3 className="text-lg font-semibold">Tópicos Transversais (Todos os Níveis)</h3>
                </div>
                <div className="bg-card border border-border rounded-xl p-0 overflow-hidden shadow-sm">
                  {Object.entries(
                    allLevelsCurriculum.lessons.reduce((acc: Record<string, string[]>, lessonTitle: string) => {
                        const status = getLessonStatus(lessonTitle);
                        if (status === 'completed') acc['Concluídas'] = [...(acc['Concluídas']||[]), lessonTitle];
                        else if (status === 'scheduled' || status === 'rescheduled' || status === 'in_progress') acc['Agendadas'] = [...(acc['Agendadas']||[]), lessonTitle];
                        else acc['Pendentes a Estudar'] = [...(acc['Pendentes a Estudar']||[]), lessonTitle];
                        return acc;
                    }, {})
                  ).map(([groupName, groupLessons]: [string, string[]]) => (
                    <div key={groupName}>
                      <div className="px-4 py-2 bg-secondary/50 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {groupName} ({groupLessons.length})
                      </div>
                      {groupLessons.map((lessonTitle) => {
                        const status = getLessonStatus(lessonTitle);
                        return (
                          <div key={lessonTitle} className={`flex items-center justify-between p-4 border-b border-border last:border-0 hover:bg-accent/50 sidebar-transition ${status === 'completed' ? 'opacity-70' : ''}`}>
                            <div className="flex items-center gap-3">
                              {status === 'completed' ? <CheckCircle2 className="text-green-500" size={20} /> : <Circle className="text-muted-foreground/50" size={20} />}
                              <span className={`font-medium ${status === 'completed' ? 'text-muted-foreground line-through' : 'text-card-foreground'}`}>
                                {lessonTitle}
                              </span>
                            </div>
                            {status !== 'pending' && <StatusBadge status={status} />}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          {isLoading ? (
            <p>Carregando aulas...</p>
          ) : (
            <div className="space-y-3">
              {filtered.length === 0 && <p className="text-muted-foreground animate-fade-in">Nenhuma aula encontrada para este filtro.</p>}
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
                      <div className="mt-4 pt-4 border-t border-border space-y-6 animate-fade-in">
                        {/* Links section */}
                        <div className="flex flex-wrap gap-2">
                          {lesson.meeting_url && (
                            <a href={lesson.meeting_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors">
                              <Video size={16} /> Entrar no Zoom/Meet
                            </a>
                          )}
                          {lesson.recording_url && (
                            <a href={lesson.recording_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors">
                              <Play size={16} /> Ver Gravação
                            </a>
                          )}
                        </div>

                        {/* Flashcards & Resumo */}
                        <FlashcardEditor lesson={lesson} refetch={refetch} />

                        {/* Attachments */}
                        {lesson.attachments?.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Materiais de Apoio</p>
                            <div className="space-y-2">
                              {lesson.attachments.map((att: any) => (
                                <a key={att.id} href={att.file_url} target="_blank" download className="flex items-center justify-between p-3 rounded-lg border border-border bg-card hover:bg-muted/50 cursor-pointer transition">
                                  <div className="flex items-center gap-3">
                                    <FileText size={18} className="text-primary" />
                                    <span className="text-sm font-medium text-foreground">Material da Aula.pdf</span>
                                  </div>
                                  <Download size={16} className="text-muted-foreground" />
                                </a>
                              ))}
                            </div>
                          </div>
                        )}

                        {lesson.notes && (
                          <div className="relative group">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 flex justify-between items-center">
                              Notas do professor
                              {user?.role === 'teacher' && (
                                <Link to={`/aulas/${lesson.id}/anotar`} className="flex items-center gap-1 text-primary hover:underline opacity-0 group-hover:opacity-100 transition-opacity lowercase">
                                  <Edit2 size={12} /> editar notas e aula
                                </Link>
                              )}
                            </p>
                            {user?.role === 'teacher' ? (
                              <Link to={`/aulas/${lesson.id}/anotar`} className="block text-sm text-card-foreground leading-relaxed prose prose-sm max-w-none bg-muted/30 p-3 rounded-lg border border-transparent hover:border-border hover:bg-muted/50 transition cursor-pointer" dangerouslySetInnerHTML={{ __html: lesson.notes }} />
                            ) : (
                              <div className="block text-sm text-card-foreground leading-relaxed prose prose-sm max-w-none bg-muted/30 p-3 rounded-lg border border-border" dangerouslySetInnerHTML={{ __html: lesson.notes }} />
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </DashboardLayout>
  );
};

export default MinhasAulas;
