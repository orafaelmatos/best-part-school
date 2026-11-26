import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, PenLine } from "lucide-react";
import { Alert, Button, Card, EmptyState, IconTile, Skeleton } from "@/components/student/ui";
import WritingReportCard from "@/components/WritingReportCard";
import { iconStroke } from "@/design-system/tokens";
import { writingReportStatus, type WritingReportRecord } from "@/lib/writing";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

const WritingStudentProgress = ({ studentId }: { studentId: string }) => {
  const [page, setPage] = useState(1);
  const { user } = useAuth();
  const canRead = Boolean(user?.user_id && (user.role === "teacher" || user.role === "admin"));
  const reports = useQuery({
    queryKey: ["student-writing-reports", user?.user_id, studentId, page],
    gcTime: 0,
    queryFn: async () => {
      const response = await api.get("/ai-study/writing-reports/", { params: { student: studentId, page } });
      return response.data as { count: number; next: string | null; previous: string | null; results: WritingReportRecord[] };
    },
    enabled: canRead && Boolean(studentId),
  });
  if (!canRead) return null;
  return <Card as="section" aria-label="Acompanhamento de Writing" className="min-w-0 space-y-5">
    <div className="flex items-start gap-3">
      <IconTile icon={PenLine} tone="ai" />
      <div className="min-w-0">
        <h2 className="text-h3 text-ink">Writing com IA</h2>
        <p className="mt-1 text-body text-ink-secondary">Atividades, acertos, correções e sugestões de revisão por cenário.</p>
      </div>
    </div>
    {reports.isLoading ? <div role="status" aria-label="Carregando práticas de Writing" className="space-y-3">
      <span className="sr-only">Carregando práticas de Writing...</span>
      <Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" />
    </div> : reports.isError ? <Alert tone="danger" role="alert" title="Não foi possível consultar as práticas deste aluno."
      action={<Button variant="outline" size="sm" onClick={() => void reports.refetch()}>Tentar novamente</Button>} />
      : !reports.data?.results.length ? <EmptyState compact icon={PenLine} title="Ainda não há práticas de Writing registradas." /> : <>
        <ul className="divide-y divide-line border-y border-line">
          {reports.data.results.map((item) => <li key={item.id}>
            <details className="group/report">
              <summary className="relative block min-h-16 cursor-pointer list-none rounded-md py-3 pr-8 text-body font-medium text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-details-marker]:hidden">
                {new Date(item.updated_at).toLocaleDateString("pt-BR")} · {item.report.scenario} · {item.report.level} · {writingReportStatus[item.status]}
                <span className="mt-1 block text-caption font-normal text-ink-secondary">{item.report.activities_completed} atividades respondidas · {item.report.correct} acertos · {item.report.needs_work} respostas com ajustes</span>
                <ChevronDown size={20} strokeWidth={iconStroke} aria-hidden="true" className="absolute right-0 top-4 text-ink-muted transition-transform duration-200 ease-standard group-open/report:rotate-180" />
              </summary>
              <div className="pb-5 pt-2"><WritingReportCard report={item.report} /></div>
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

export default WritingStudentProgress;
