import React, { useState } from "react";
import { Book, Edit2, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

export const FlashcardItem = ({ nw, isTeacher, isStudent, onEdit, onDelete, onStatusUpdate }: any) => {
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

export const FlashcardEditor = ({ lesson, refetch }: { lesson: any, refetch: () => void }) => {
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
          <Book size={16} /> Flashcards (Anki) & Palavras Aprendidas (Vocabulário)
        </h4>
      </div>

      {lesson?.new_words?.length > 0 ? (
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
        <p className="text-sm text-muted-foreground">Nenhuma palavra cadastrada ainda.</p>
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