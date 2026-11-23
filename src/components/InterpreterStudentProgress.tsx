import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import InterpreterReportCard from "@/components/InterpreterReportCard";
import { api } from "@/lib/api";
import { buildInterpreterSessionPath, formatDateTime, type SessionSummary } from "@/lib/aiStudy";

const InterpreterStudentProgress = ({ studentId }: { studentId: string }) => {
  const { user } = useAuth();
  const canRead = user?.role === "teacher" || user?.role === "admin";
  const query = useQuery({
    queryKey: ["student-interpreter-sessions", user?.user_id, studentId], gcTime: 0,
    enabled: canRead && Boolean(studentId),
    queryFn: async () => (await api.get("/ai-study/sessions/", { params: { modes: "listening", student: studentId } })).data as SessionSummary[],
  });
  if (!canRead) return null;
  const sessions = query.data?.filter((session) => Boolean(session.guided_state?.interpreter));
  return <section aria-label="Acompanhamento de interpretação" className="space-y-4 rounded-3xl border border-border bg-card p-5">
    <h2 className="text-xl font-semibold">Intérprete IA</h2><p className="text-sm text-muted-foreground">Interpretações, informações preservadas e dificuldades registradas nas sessões do aluno.</p>
    {query.isLoading ? <p role="status">Carregando interpretações...</p> : query.isError ? <div role="alert"><p>Não foi possível consultar as sessões.</p><Button variant="outline" onClick={() => void query.refetch()}>Tentar novamente</Button></div> : !sessions?.length ? <p className="text-sm text-muted-foreground">Ainda não há sessões de interpretação registradas.</p> : sessions.map((session) => <details key={session.id} className="rounded-2xl border border-border p-4"><summary className="cursor-pointer text-sm font-medium">{session.title} · {session.guided_state?.level} · {session.status === "completed" ? "Encerrada" : "Em andamento"}<span className="mt-1 block text-xs font-normal text-muted-foreground">{formatDateTime(session.last_interaction_at)}</span></summary><div className="mt-4 space-y-3">{session.guided_state!.interpreter!.report ? <InterpreterReportCard report={session.guided_state!.interpreter!.report!} /> : <p className="text-sm">Aguardando a primeira interpretação.</p>}<Button variant="outline" asChild><Link to={buildInterpreterSessionPath(session.id)}>Ver falas e gravações</Link></Button></div></details>)}
  </section>;
};
export default InterpreterStudentProgress;
