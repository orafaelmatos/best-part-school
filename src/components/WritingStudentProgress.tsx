import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import WritingReportCard from "@/components/WritingReportCard";
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
  return <section aria-label="Acompanhamento de Writing" className="min-w-0 space-y-4 rounded-[28px] border border-border bg-card p-5 shadow-sm">
    <div><h2 className="text-xl font-semibold">Writing com IA</h2><p className="mt-1 text-sm text-muted-foreground">Atividades, acertos, correções e sugestões de revisão por cenário.</p></div>
    {reports.isLoading ? <p role="status">Carregando práticas de Writing...</p> : reports.isError ? <div role="alert" className="space-y-2">
      <p>Não foi possível consultar as práticas deste aluno.</p><Button variant="outline" onClick={() => void reports.refetch()}>Tentar novamente</Button>
    </div> : !reports.data?.results.length ? <p className="text-sm text-muted-foreground">Ainda não há práticas de Writing registradas.</p> : <>
      {reports.data.results.map((item) => <details key={item.id} className="rounded-2xl border border-border p-4">
        <summary className="cursor-pointer text-sm font-medium">
          {new Date(item.updated_at).toLocaleDateString("pt-BR")} · {item.report.scenario} · {item.report.level} · {writingReportStatus[item.status]}
          <span className="mt-1 block text-xs font-normal text-muted-foreground">{item.report.activities_completed} atividades respondidas · {item.report.correct} acertos · {item.report.needs_work} respostas com ajustes</span>
        </summary>
        <div className="mt-4"><WritingReportCard report={item.report} /></div>
      </details>)}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" disabled={!reports.data.previous} onClick={() => setPage((value) => value - 1)}>Anteriores</Button>
        <span className="text-sm text-muted-foreground">Página {page} · {reports.data.count} registros</span>
        <Button variant="outline" disabled={!reports.data.next} onClick={() => setPage((value) => value + 1)}>Próximos</Button>
      </div>
    </>}
  </section>;
};

export default WritingStudentProgress;
