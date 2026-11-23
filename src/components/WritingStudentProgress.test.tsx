import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import WritingStudentProgress from "@/components/WritingStudentProgress";
import { api } from "@/lib/api";
import { writingReportFixture } from "@/test/writing";

vi.mock("@/lib/api", () => ({ api: { get: vi.fn() } }));
const auth = vi.hoisted(() => ({ user: { user_id: "teacher-1", role: "teacher" } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => auth }));
afterEach(() => { cleanup(); vi.clearAllMocks(); auth.user.role = "teacher"; });
const show = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
  <WritingStudentProgress studentId="student-1" />
</QueryClientProvider>);

describe("Teacher Writing follow-up", () => {
  it("does not fetch teacher history under a student identity", () => {
    auth.user.role = "student";
    const { container } = show();
    expect(container).toBeEmptyDOMElement();
    expect(api.get).not.toHaveBeenCalled();
  });

  it("loads persisted corrections for the selected student and paginates", async () => {
    vi.mocked(api.get).mockImplementation(async (_url, config) => {
      const second = config?.params?.page === 2;
      return { data: { count: 11, next: second ? null : "next", previous: second ? "previous" : null,
        results: [{ id: second ? "report2" : "report1", updated_at: "2026-11-05T15:00:00Z", status: "completed",
          report: { ...writingReportFixture(), scenario: second ? "Hotel" : "Turismo" } }] } };
    });
    show();
    fireEvent.click(await screen.findByText(/05\/11\/2026 · Turismo/));
    expect(screen.getByRole("region", { name: "Resumo de Writing" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Próximos" }));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/ai-study/writing-reports/", { params: { student: "student-1", page: 2 } }));
    expect(await screen.findByText(/05\/11\/2026 · Hotel/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Próximos" })).toBeDisabled();
  });

  it("offers retry after a failed lookup", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("unavailable"));
    show();
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível consultar");
    vi.mocked(api.get).mockResolvedValue({ data: { count: 0, results: [] } });
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByText("Ainda não há práticas de Writing registradas.")).toBeVisible();
  });
});
