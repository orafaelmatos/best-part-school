import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ChevronDown, Languages } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Alert, Badge, Button, EmptyState, IconTile, SkeletonCard, cardVariants } from "@/components/student/ui";
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
  return <section aria-label="Acompanhamento de interpretação" className="min-w-0 space-y-4">
    <div className="flex items-start gap-3">
      <IconTile icon={Languages} tone="ai" />
      <div className="min-w-0">
        <h2 className="text-h3 text-ink">Intérprete IA</h2>
        <p className="mt-1 text-body text-ink-secondary">Interpretações, informações preservadas e dificuldades registradas nas sessões do aluno.</p>
      </div>
    </div>
    {query.isLoading ? <SkeletonCard label="Carregando interpretações" />
      : query.isError ? <Alert tone="danger" role="alert" title="Não foi possível consultar as sessões." action={<Button size="sm" variant="outline" onClick={() => void query.refetch()}>Tentar novamente</Button>} />
        : !sessions?.length ? <div className={cardVariants({ variant: "dashed", padding: "none" })}><EmptyState compact icon={Languages} title="Ainda não há sessões de interpretação registradas." /></div>
          : <div className="space-y-3">{sessions.map((session) => {
            const completed = session.status === "completed";
            const report = session.guided_state!.interpreter!.report;
            return <details key={session.id} className="group space-y-3">
              <summary className={cardVariants({ padding: "md", interactive: true, className: "flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden" })}>
                <span className="min-w-0 flex-1">
                  <span className="block text-body font-medium text-ink">{session.title}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-2 text-caption text-ink-muted">
                    {session.guided_state?.level ? <Badge tone="neutral">{session.guided_state.level}</Badge> : null}
                    <Badge tone={completed ? "success" : "primary"}>{completed ? "Encerrada" : "Em andamento"}</Badge>
                    <span>{formatDateTime(session.last_interaction_at)}</span>
                  </span>
                </span>
                <ChevronDown size={20} className="shrink-0 text-ink-muted transition-transform duration-200 ease-standard group-open:rotate-180" aria-hidden="true" />
              </summary>
              {report ? <InterpreterReportCard report={report} /> : <p className="px-1 text-body text-ink-secondary">Aguardando a primeira interpretação.</p>}
              <Button variant="outline" asChild><Link to={buildInterpreterSessionPath(session.id)}>Ver falas e gravações</Link></Button>
            </details>;
          })}</div>}
  </section>;
};
export default InterpreterStudentProgress;
