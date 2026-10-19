import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import Alunos from "@/pages/Alunos";
import { api } from "@/lib/api";

vi.mock("@/components/DashboardLayout", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/PastLessonSummary", () => ({ default: () => null }));
vi.mock("@/components/RichTextEditor", () => ({ default: () => null }));
vi.mock("@/components/FileUploadField", () => ({ default: () => null }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { role: "teacher", user_id: "teacher-1" } }),
}));
vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), patch: vi.fn() } }));

afterEach(() => vi.clearAllMocks());

describe("Group member editing", () => {
  it("preserves the shared schedule and plan when saving a member profile", async () => {
    const student = {
      id: "student-2", name: "Aluno do grupo", email: "student@example.com", role: "student",
      level: "A1/A2", student_groups: ["group-1"], planned_lessons_count: 0,
      effective_planned_lessons_count: 40, completed_lessons_count: 0,
      recurring_schedules: [{
        id: "schedule-1", group: "group-1", teacher: "teacher-1",
        day_of_week: 2, start_time: "19:30:00", active: true,
      }],
    };
    vi.mocked(api.get).mockImplementation(async (url) => {
      if (url === "/accounts/users/") return { data: [student] };
      if (url === "/finance/settings/me/") return { data: { default_monthly_fee: "350.00", default_due_day: 10 } };
      if (url === "/teacher-availability/teacher-1/") {
        return { data: {
          slots: [{ day_of_week: 2, start: "18:00:00", end: "22:00:00" }],
          blocked: [], busy: [],
          recurring_busy: [{ id: "schedule-1", day_of_week: 2, start_time: "19:30" }],
        } };
      }
      throw new Error(`Unexpected GET ${url}`);
    });
    vi.mocked(api.patch).mockResolvedValue({ data: student });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter><Alunos /></MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByTitle("Editar"));
    expect(screen.getByText(/A agenda é compartilhada com o grupo/)).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "19:30" })).toBeEnabled();
    expect(api.get).toHaveBeenCalledWith("/teacher-availability/teacher-1/", {
      params: { exclude_schedules: "schedule-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar Edicao" }));

    await waitFor(() => expect(api.patch).toHaveBeenCalled());
    const [url, payload] = vi.mocked(api.patch).mock.calls[0];
    expect(url).toBe("/accounts/users/student-2/");
    expect(payload).toBeInstanceOf(FormData);
    expect((payload as FormData).get("schedules")).toBe('[{"day_of_week":2,"time":"19:30"}]');
    expect((payload as FormData).get("planned_lessons_count")).toBe("40");
  });
});
