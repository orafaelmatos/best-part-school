import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import DashboardLayout from "@/components/DashboardLayout";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { CalendarClock, CheckCircle2, Clock, Inbox, ArrowLeft } from "lucide-react";

type QuestionType = "open_text" | "multiple_choice";
type ApiHomeworkStatus = "draft" | "pending" | "sent" | "corrected";

type HomeworkQuestion = {
  id: string;
  type: QuestionType;
  prompt: string;
  options: string[];
  order: number;
};

type HomeworkAnswer = {
  id: string;
  question: string;
  answer_text?: string;
  selected_option_index?: number | null;
  teacher_feedback?: string;
};

type HomeworkItem = {
  id: string;
  title: string;
  description?: string;
  classification?: string;
  status: ApiHomeworkStatus;
  due_date?: string | null;
  teacher_feedback?: string;
  student_name?: string;
  teacher_name?: string;
  lesson_title?: string;
  questions: HomeworkQuestion[];
  answers?: HomeworkAnswer[];
  updated_at?: string | null;
};

const statusStyles = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  sent: "bg-blue-50 text-blue-700 border-blue-200",
  late: "bg-red-50 text-red-700 border-red-200",
  corrected: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const getHomeworkStatus = (homework: HomeworkItem) => {
  if (homework.status === "corrected") return "corrected";
  if (homework.status === "sent") return "sent";
  if (homework.due_date && new Date(homework.due_date).getTime() < Date.now()) return "late";
  return "pending";
};

const formatDate = (value?: string | null) => {
  if (!value) return "Sem prazo";
  return new Date(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

export default function CorrigirHomework() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [selectedHomework, setSelectedHomework] = useState<HomeworkItem | null>(null);
  const [generalFeedback, setGeneralFeedback] = useState("");
  const [answersFeedback, setAnswersFeedback] = useState<Record<string, string>>({});
  const [openingHomeworkId, setOpeningHomeworkId] = useState<string | null>(null);

  const { data: homeworkItems = [], isLoading } = useQuery({
    queryKey: ["teacher-homework"],
    queryFn: async () => {
      // Excluímos rascunhos para correção
      const res = await api.get("/homework/?ordering=-updated_at");
      const list = Array.isArray(res.data) ? res.data : (res.data?.results || []);
      // Filtrar apenas o que foi respondido (sent) ou corrigido ou pending
      return list.filter((hw: HomeworkItem) => hw.status !== "draft") as HomeworkItem[];
    },
  });

  const { pendingReviewCount, filteredHomeworkItems } = useMemo(() => {
    let pendingReview = 0;
    const items = homeworkItems.filter(item => {
      if (item.status === "sent") {
        pendingReview++;
        // Queremos focar nos enviados recentemente
      }
      return true; 
    });
    return { pendingReviewCount: pendingReview, filteredHomeworkItems: items };
  }, [homeworkItems]);

  const correctionMutation = useMutation({
    mutationFn: async ({ homeworkId, payload }: { homeworkId: string, payload: any }) => {
      // O endpoint pode não ter uma rota de corrigir de uma vez, mas podemos atualizar o status para corrected em /homework/id/
      // e atualizar feedbacks de respostas via patch se existir, aqui usarei PATCH para Homework e se a API suportar perguntas a gente pode mandar ou faço chamadas manuais.
      
      // Patch principal
      const patchData = {
        status: "corrected",
        teacher_feedback: payload.generalFeedback
      };
      await api.patch(`/homework/${homeworkId}/`, patchData);

      // Patch para cada resposta se existir
      if (payload.answersFeedback) {
         for (const answerId of Object.keys(payload.answersFeedback)) {
             await api.patch(`/homework-answers/${answerId}/`, {
                 teacher_feedback: payload.answersFeedback[answerId]
             });
         }
      }
      return true;
    },
    onSuccess: () => {
      toast({
        title: "Sucesso",
        description: "Homework corrigida com sucesso!",
      });
      queryClient.invalidateQueries({ queryKey: ["teacher-homework"] });
      setSelectedHomework(null);
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Não foi possível enviar a correção.",
        variant: "destructive"
      });
    }
  });

  const handleCorrect = async (homework: HomeworkItem) => {
    setOpeningHomeworkId(homework.id);
    try {
      const { data } = await api.get(`/homework/${homework.id}/`);
      const latestHomework = data as HomeworkItem;

      setGeneralFeedback(latestHomework.teacher_feedback || "");
      const initialFeedback: Record<string, string> = {};
      latestHomework.answers?.forEach(ans => {
        if (ans.id && ans.teacher_feedback) {
          initialFeedback[ans.id] = ans.teacher_feedback;
        }
      });
      setAnswersFeedback(initialFeedback);
      setSelectedHomework(latestHomework);
    } finally {
      setOpeningHomeworkId(null);
    }
  };

  const onSubmitCorrection = () => {
    if (!selectedHomework) return;
    correctionMutation.mutate({
      homeworkId: selectedHomework.id,
      payload: {
        generalFeedback,
        answersFeedback
      }
    });
  };

  if (selectedHomework) {
    return (
      <DashboardLayout>
        <PageHeader 
          title="Corrigir Atividade" 
          description={`Aluno: ${selectedHomework.student_name || "Desconhecido"}`}
        />
        <div className="space-y-4 max-w-4xl">
          <button 
            onClick={() => setSelectedHomework(null)} 
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4"
          >
            <ArrowLeft size={16} /> Voltar
          </button>
          
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div>
              <h2 className="text-xl font-bold">{selectedHomework.title}</h2>
              <p className="text-sm text-muted-foreground">{selectedHomework.lesson_title ? `Aula: ${selectedHomework.lesson_title}` : ""}</p>
            </div>

            <div className="space-y-6 mt-6">
              {selectedHomework.questions.map((q, idx) => {
                const answer = selectedHomework.answers?.find(a => a.question === q.id);
                
                return (
                  <div key={q.id} className="border border-border rounded-lg p-4 bg-background">
                    <p className="font-semibold text-sm mb-2">{idx + 1}. {q.prompt}</p>
                    
                    {answer ? (
                      <div className="bg-muted/50 p-3 rounded-md mb-3 border border-border text-sm">
                        <span className="font-medium text-xs text-muted-foreground uppercase tracking-wide block mb-1">
                          Resposta do aluno:
                        </span>
                        {q.type === 'open_text' ? (
                          <span className="whitespace-pre-wrap">{answer.answer_text || "(em branco)"}</span>
                        ) : (
                          <span>{answer.selected_option_index != null && q.options[answer.selected_option_index] ? q.options[answer.selected_option_index] : "(não selecionada)"}</span>
                        )}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground italic mb-4">
                        O aluno não respondeu a esta questão.
                      </div>
                    )}

                    <div className="space-y-2 mt-4">
                      <label className="text-xs font-semibold text-foreground">Feedback para essa questão (Opcional):</label>
                      <Textarea 
                        placeholder="Deixe um comentário sobre a resposta..."
                        value={(answer?.id && answersFeedback[answer.id]) || ""}
                        onChange={(e) => {
                          if(answer?.id) {
                            setAnswersFeedback(prev => ({ ...prev, [answer.id]: e.target.value }));
                          }
                        }}
                        rows={2}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 pt-6 border-t border-border">
              <label className="block text-sm font-semibold mb-2">Feedback Geral e Nota</label>
              <Textarea 
                placeholder="Escreva um comentário geral sobre o desempenho do aluno nessa atividade..."
                value={generalFeedback}
                onChange={(e) => setGeneralFeedback(e.target.value)}
                rows={4}
              />
            </div>

            <div className="pt-4 flex justify-end">
              <Button onClick={onSubmitCorrection} disabled={correctionMutation.isPending}>
                <CheckCircle2 className="mr-2 h-4 w-4" /> 
                {correctionMutation.isPending ? "Salvando..." : "Concluir Correção"}
              </Button>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <PageHeader 
        title="Homework" 
        description="Avalie os exercícios enviados pelos alunos."
      />

      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <div className="rounded-xl border border-border bg-card p-4 flex items-start gap-4">
          <div className="rounded-lg bg-blue-50 p-2 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">
             <Inbox size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Novas Respostas</p>
            <h3 className="text-2xl font-bold">{pendingReviewCount}</h3>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Carregando atividades...</div>
        ) : filteredHomeworkItems.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">Nenhuma atividade encontrada.</div>
        ) : (
          <div className="divide-y divide-border">
            {filteredHomeworkItems.map((item) => {
              const status = getHomeworkStatus(item);
              const isReady = item.status === "sent";

              return (
                <div key={item.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-muted/50 transition-colors">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                        status === 'sent' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                        status === 'corrected' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                        status === 'late' ? 'bg-red-50 text-red-700 border-red-200' :
                        'bg-amber-50 text-amber-700 border-amber-200'
                      }`}>
                        {status === 'sent' ? 'Aguardando Correção' :
                         status === 'corrected' ? 'Corrigido' :
                         status === 'late' ? 'Atrasado' : 'Pendente'}
                      </span>
                      <span className="text-xs text-muted-foreground">Enviado por {item.student_name || "Desconhecido"}</span>
                    </div>
                    <h4 className="font-semibold">{item.title}</h4>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Atualizado em {formatDate(item.updated_at || item.due_date)}
                    </p>
                  </div>
                  
                  <div>
                    {isReady ? (
                      <Button onClick={() => void handleCorrect(item)} size="sm" disabled={openingHomeworkId === item.id}>
                        {openingHomeworkId === item.id ? "Carregando..." : "Avaliar"}
                      </Button>
                    ) : status === 'corrected' ? (
                      <Button onClick={() => void handleCorrect(item)} size="sm" variant="outline" disabled={openingHomeworkId === item.id}>
                        {openingHomeworkId === item.id ? "Carregando..." : "Ver Avaliação"}
                      </Button>
                    ) : (
                       <Button size="sm" variant="secondary" disabled>
                        Aguardando Aluno
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
