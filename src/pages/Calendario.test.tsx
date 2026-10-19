import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import Calendario from "@/pages/Calendario";
import { api } from "@/lib/api";
import { APP_PATHS } from "@/lib/routes";

vi.mock("@/components/DashboardLayout", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/PastLessonSummary", () => ({ default: () => null }));
vi.mock("@/components/ScheduleSlotPicker", () => ({ default: () => null }));
vi.mock("@/pages/TeacherAvailabilityModal", () => ({ default: () => null }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { role: "teacher", user_id: "teacher-1" } }),
}));
vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), patch: vi.fn() } }));

const mockedGet = vi.mocked(api.get);
const mockedPatch = vi.mocked(api.patch);

const makeLesson = (group: string | null) => {
  const now = new Date();
  return {
    id: "lesson-1",
    title: "Conversation",
    group,
    student: group ? null : "student-1",
    student_name: group ? "Grupo teste" : "Aluno teste",
    teacher: "teacher-1",
    status: "scheduled",
    is_template: false,
    is_extra: false,
    order: 1,
    date: new Date(now.getFullYear(), now.getMonth(), 15, 12).toISOString(),
  };
};

const LocationDisplay = () => {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}{location.search}</div>;
};

const renderCalendar = (lesson: ReturnType<typeof makeLesson>) => {
  mockedGet.mockImplementation(async (url) => {
    if (url === "/lessons/?all=true&is_template=false" || url === "/lessons/") {
      return { data: [lesson] };
    }
    if (url === "/accounts/users/") return { data: [] };
    if (String(url).startsWith("/teacher-availability/")) {
      return { data: { slots: [], blocked: [], busy: [], recurring_busy: [] } };
    }
    throw new Error(`Unexpected GET ${url}`);
  });
  mockedPatch.mockResolvedValue({ data: { ...lesson, status: "in_progress" } });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Calendario />
        <LocationDisplay />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

afterEach(() => vi.clearAllMocks());

describe("Calendar lesson start", () => {
  it("starts a shared group lesson directly without individual sequence parameters", async () => {
    renderCalendar(makeLesson("group-1"));
    fireEvent.click(await screen.findByText("Grupo teste"));
    fireEvent.click(screen.getByRole("button", { name: "Iniciar Aula" }));

    await waitFor(() => {
      expect(mockedPatch).toHaveBeenCalledWith("/lessons/lesson-1/start_lesson/", {});
      expect(screen.getByTestId("location")).toHaveTextContent(`${APP_PATHS.annotateLesson("lesson-1")}?from=calendar`);
    });
    expect(screen.queryByText("Aula da Trilha ou Nova Aula")).not.toBeInTheDocument();
  });

  it("keeps the sequence selector when starting an individual lesson", async () => {
    renderCalendar(makeLesson(null));
    fireEvent.click(await screen.findByText("Aluno teste"));
    fireEvent.click(screen.getByRole("button", { name: "Iniciar Aula" }));

    expect(screen.getByText("Aula da Trilha ou Nova Aula")).toBeInTheDocument();
    expect(mockedPatch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Iniciar Aula" }));
    await waitFor(() => {
      expect(mockedPatch).toHaveBeenCalledWith("/lessons/lesson-1/start_lesson/", { selected_lesson: "lesson-1" });
    });
  });

  it("keeps custom lesson creation for individual students", async () => {
    renderCalendar(makeLesson(null));
    fireEvent.click(await screen.findByText("Aluno teste"));
    fireEvent.click(screen.getByRole("button", { name: "Iniciar Aula" }));

    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "Travel practice" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Iniciar Aula" }));
    await waitFor(() => {
      expect(mockedPatch).toHaveBeenCalledWith("/lessons/lesson-1/start_lesson/", { custom_lesson_title: "Travel practice" });
    });
  });
});
