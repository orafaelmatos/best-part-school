import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Mic } from "lucide-react";
import { Alert, Button, Card, EmptyState, IconTile, Skeleton } from "@/components/student/ui";
import SpeakingReportCard from "@/components/SpeakingReportCard";
import { iconStroke } from "@/design-system/tokens";
import { speakingCount, speakingReportStatus } from "@/lib/aiStudy";
import { api } from "@/lib/api";
import type { SpeakingReportRecord } from "@/lib/aiStudy";
import { useAuth } from "@/contexts/AuthContext";

const SpeakingStudentProgress = ({ studentId }: { studentId: string }) => {
  const [page, setPage] = useState(1);
  const { user } = useAuth();
  const canRead = Boolean(user?.user_id && (user.role === "teacher" || user.role === "admin"));
  const reports = useQuery({
    queryKey: ["student-speaking-reports", user?.user_id, studentId, page],
    gcTime: 0,
    queryFn: async () => {
      const response = await api.get("/ai-study/speaking-reports/", { params: { student: studentId, page } });
      return response.data as { count: number; next: string | null; previous: string | null; results: SpeakingReportRecord[] };
    },
    enabled: canRead && Boolean(studentId),
  });
  const overview = useQuery({
    queryKey: ["student-speaking-overview", user?.user_id, studentId],
    gcTime: 0,
    queryFn: async () => {
      const response = await api.get("/ai-study/progress/overview/", { params: { student: studentId } });
      return response.data.speaking_sessions as { total: number; completed: number };
    },
    enabled: canRead && Boolean(studentId),
  });
  if (!canRead) return null;
  return <Card as="section" aria-label="Acompanhamento de Speaking" className="min-w-0 space-y-5">
    <div className="flex items-start gap-3">
      <IconTile icon={Mic} tone="ai" />
      <div className="min-w-0">
        <h2 className="text-h3 text-ink">Speaking com IA</h2>
        <p className="mt-1 text-body text-ink-secondary">Evolução por cenário, com evidências de respostas e sugestões de revisão.</p>
      </div>
    </div>
    {overview.data ? <p className="text-body font-medium text-ink">{speakingCount(overview.data.total, "cenário registrado", "cenários registrados")} · {speakingCount(overview.data.completed, "encerrado", "encerrados")}</p> : null}
    {reports.isLoading ? <div role="status" aria-label="Carregando práticas de Speaking" className="space-y-3">
      <span className="sr-only">Carregando práticas de Speaking...</span>
      <Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" />
    </div> : reports.isError ? <Alert tone="danger" role="alert" title="Não foi possível consultar as práticas deste aluno."
      action={<Button variant="outline" size="sm" onClick={() => void reports.refetch()}>Tentar novamente</Button>} />
      : !reports.data?.results.length ? <EmptyState compact icon={Mic} title="Ainda não há práticas de Speaking registradas." /> : <>
        <ul className="divide-y divide-line border-y border-line">
          {reports.data.results.map((item) => <li key={item.id}>
            <details className="group/report">
              <summary className="relative block min-h-16 cursor-pointer list-none rounded-md py-3 pr-8 text-body font-medium text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-details-marker]:hidden">
                {new Date(item.updated_at).toLocaleDateString("pt-BR")} · {item.report.scenario} · {item.report.level} · {speakingReportStatus[item.status]}
                <span className="mt-1 block text-caption font-normal text-ink-secondary">{speakingCount(item.report.progress.evaluated_responses, "resposta avaliada", "respostas avaliadas")} · {speakingCount(item.report.progress.situations_completed, "situação concluída", "situações concluídas")}</span>
                <ChevronDown size={20} strokeWidth={iconStroke} aria-hidden="true" className="absolute right-0 top-4 text-ink-muted transition-transform duration-200 ease-standard group-open/report:rotate-180" />
              </summary>
              <div className="pb-5 pt-2"><SpeakingReportCard report={item.report} /></div>
            </details>
          </li>)}
        </ul>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" size="sm" disabled={!reports.data.previous} onClick={() => setPage((value) => value - 1)}>Anteriores</Button>
          <span className="text-body text-ink-secondary">Página {page} · {reports.data.count} registros</span>
          <Button variant="outline" size="sm" disabled={!reports.data.next} onClick={() => setPage((value) => value + 1)}>Próximos</Button>
        </div>
      </>}
  </Card>;
};

export default SpeakingStudentProgress;
