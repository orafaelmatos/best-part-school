import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SpeakingReportCard from "@/components/SpeakingReportCard";
import { speakingReportFixture } from "@/test/speakingReport";

describe("Evidence-based Speaking report", () => {
  it("reveals actual phrases, recurring difficulties and recommendations progressively", () => {
    render(<SpeakingReportCard report={speakingReportFixture()} />);
    expect(screen.getByText(/3 respostas avaliadas/)).toBeVisible();
    expect(screen.getByText(/Pronúncia não avaliada/)).toBeVisible();
    expect(screen.getByText("My name is Gabriel.").closest("details")).not.toHaveAttribute("open");
    fireEvent.click(screen.getByText("Frases utilizadas"));
    expect(screen.getByText("My name is Gabriel.").closest("details")).toHaveAttribute("open");
    expect(screen.getByText("Transcrição do áudio")).toBeVisible();
    expect(screen.getByText(/Retome este ponto com seu professor/)).toBeInTheDocument();
    expect(screen.queryByText(/nota|score/i)).not.toBeInTheDocument();
  });

  it("does not invent successes or completion when practice ends before any answer", () => {
    const report = speakingReportFixture();
    report.phrases_used = []; report.vocabulary = []; report.strengths = []; report.difficulties = []; report.recurring_errors = [];
    report.progress = { ...report.progress, evaluated_responses: 0, activities_completed: 0, situations_completed: 0, situations: [] };
    render(<SpeakingReportCard report={report} />);
    expect(screen.getByText(/0 respostas avaliadas · 0 atividades concluídas · 0 situações concluídas/)).toBeInTheDocument();
    expect(screen.queryByText("Resposta adequada ao contexto.")).not.toBeInTheDocument();
  });
});
