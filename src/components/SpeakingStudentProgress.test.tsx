import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import SpeakingStudentProgress from "@/components/SpeakingStudentProgress";
import { api } from "@/lib/api";
import { speakingReportFixture } from "@/test/speakingReport";

vi.mock("@/lib/api", () => ({ api: { get: vi.fn() } }));
const auth = vi.hoisted(() => ({ user: { user_id: "teacher-1", role: "teacher" } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => auth }));
afterEach(() => { vi.clearAllMocks(); auth.user.role = "teacher"; });
const show = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
  <SpeakingStudentProgress studentId="student-1" />
</QueryClientProvider>);

describe("Teacher Speaking follow-up", () => {
  it("does not fetch teacher history under a student identity", () => {
    auth.user.role = "student";
    const { container } = show();
    expect(container).toBeEmptyDOMElement();
    expect(api.get).not.toHaveBeenCalled();
  });
  it("loads only the selected student and paginates history with persisted report evidence", async () => {
    vi.mocked(api.get).mockImplementation(async (url, config) => {
      if (url.includes("overview")) return { data: { speaking_sessions: { total: 11, completed: 8 } } };
      const second = config?.params?.page === 2;
      return { data: { count: 11, next: second ? null : "page2", previous: second ? "page1" : null,
        results: [{ id: second ? "report2" : "report1", updated_at: "2026-10-30T15:00:00Z", status: second ? "paused" : "completed",
          report: { ...speakingReportFixture(), scenario: second ? "Hotel" : "Aula de Jiu-Jitsu" } }] } };
    });
    show();
    expect(await screen.findByText("11 cenários registrados · 8 encerrados")).toBeInTheDocument();
    fireEvent.click(screen.getByText(/30\/10\/2026 · Aula de Jiu-Jitsu/));
    expect(screen.getByRole("region", { name: "Resumo de Speaking" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Próximos" }));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/ai-study/speaking-reports/", { params: { student: "student-1", page: 2 } }));
    expect(await screen.findByText(/30\/10\/2026 · Hotel · A1 · Em pausa/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Próximos" })).toBeDisabled();
  });

  it("offers retry after a failed lookup without presenting empty history as success", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("unavailable"));
    show();
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível consultar");
    expect(screen.queryByText("Ainda não há práticas de Speaking registradas.")).not.toBeInTheDocument();
    vi.mocked(api.get).mockResolvedValue({ data: { count: 0, results: [] } });
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByText("Ainda não há práticas de Speaking registradas.")).toBeInTheDocument();
  });
});
