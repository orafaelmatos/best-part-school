import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import SpeakingReportCard from "@/components/SpeakingReportCard";
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
  return <section aria-label="Acompanhamento de Speaking" className="min-w-0 space-y-4 rounded-[28px] border border-border bg-card p-5 shadow-sm">
    <div><h2 className="text-xl font-semibold">Speaking com IA</h2><p className="mt-1 text-sm text-muted-foreground">Evolução por cenário, com evidências de respostas e sugestões de revisão.</p></div>
    {overview.data ? <p className="text-sm">{speakingCount(overview.data.total, "cenário registrado", "cenários registrados")} · {speakingCount(overview.data.completed, "encerrado", "encerrados")}</p> : null}
    {reports.isLoading ? <p role="status">Carregando práticas de Speaking...</p> : reports.isError ? <div role="alert" className="space-y-2">
      <p>Não foi possível consultar as práticas deste aluno.</p><Button variant="outline" onClick={() => void reports.refetch()}>Tentar novamente</Button>
    </div> : !reports.data?.results.length ? <p className="text-sm text-muted-foreground">Ainda não há práticas de Speaking registradas.</p> : <>
      {reports.data.results.map((item) => <details key={item.id} className="rounded-2xl border border-border p-4">
        <summary className="cursor-pointer text-sm font-medium">
          {new Date(item.updated_at).toLocaleDateString("pt-BR")} · {item.report.scenario} · {item.report.level} · {speakingReportStatus[item.status]}
          <span className="mt-1 block text-xs font-normal text-muted-foreground">{speakingCount(item.report.progress.evaluated_responses, "resposta avaliada", "respostas avaliadas")} · {speakingCount(item.report.progress.situations_completed, "situação concluída", "situações concluídas")}</span>
        </summary>
        <div className="mt-4"><SpeakingReportCard report={item.report} /></div>
      </details>)}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" disabled={!reports.data.previous} onClick={() => setPage((value) => value - 1)}>Anteriores</Button>
        <span className="text-sm text-muted-foreground">Página {page} · {reports.data.count} registros</span>
        <Button variant="outline" disabled={!reports.data.next} onClick={() => setPage((value) => value + 1)}>Próximos</Button>
      </div>
    </>}
  </section>;
};

export default SpeakingStudentProgress;
