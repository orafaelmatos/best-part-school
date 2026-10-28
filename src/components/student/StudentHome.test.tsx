import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import StudentHome from "@/components/student/StudentHome";
import { api } from "@/lib/api";
import { APP_PATHS } from "@/lib/routes";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { user_id: "student-1", role: "student", name: "Ana Silva", email: "ana@example.com" } }),
}));
vi.mock("@/lib/api", () => ({ api: { get: vi.fn() } }));

const mockedGet = vi.mocked(api.get);
const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
const past = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
const lesson = { id: "lesson-1", title: "Travel conversation", status: "scheduled", date: future, teacher_name: "Julia" };

function mockData({ lessons = [], homework = [], summaries = [], vocabulary = { due_today: 0, overdue: 0, total_learned_words: 32 } }: {
  lessons?: unknown[]; homework?: unknown[]; summaries?: unknown[]; vocabulary?: unknown;
} = {}) {
  mockedGet.mockImplementation(async (url) => {
    if (url === "/lessons/") return { data: lessons };
    if (url === "/homework/") return { data: homework };
    if (url === "/students/student-1/lesson-summaries/") return { data: summaries };
    if (url === "/vocabulary-cards/dashboard/") return { data: vocabulary };
    throw new Error(`Unexpected GET ${url}`);
  });
}

function renderHome() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><MemoryRouter><StudentHome /></MemoryRouter></QueryClientProvider>);
}

afterEach(() => { vi.clearAllMocks(); });

describe("Student mobile home", () => {
  it("prioritizes actionable homework by due date and excludes submitted, draft and corrected work", async () => {
    mockData({
      lessons: [lesson],
      homework: [
        { id: "sent", title: "Awaiting correction", status: "sent", due_date: past },
        { id: "corrected", title: "Already corrected", status: "corrected", due_date: past },
        { id: "draft", title: "Teacher draft", status: "draft", due_date: past },
        { id: "pending", title: "New activity", status: "pending", due_date: future },
        { id: "started", title: "Finish your writing", status: "in_progress", due_date: past },
      ],
    });
    renderHome();
    expect(await screen.findByRole("heading", { name: "Seu homework espera por você" })).toBeInTheDocument();
    const priority = screen.getByRole("region", { name: "Seu homework espera por você" });
    expect(within(priority).getByText("Finish your writing")).toBeInTheDocument();
    expect(within(priority).getByText("2 atividades para continuar")).toBeInTheDocument();
    expect(within(priority).getByRole("link", { name: "Continuar homework" })).toHaveAttribute("href", APP_PATHS.homework);
    expect(screen.getByRole("heading", { name: "Olá, Ana!" })).toBeInTheDocument();
    expect(screen.getByText("Com Julia")).toBeInTheDocument();
  });

  it("shows a valid upcoming class instead of a stale scheduled class and calculates actual lesson progress", async () => {
    mockData({ lessons: [
      { ...lesson, id: "past", title: "Outdated scheduled lesson", date: past },
      { ...lesson, id: "completed", status: "completed" },
      { ...lesson, id: "cancelled", status: "canceled" },
      lesson,
    ] });
    renderHome();
    const priority = await screen.findByRole("region", { name: "Prepare-se para a próxima aula" });
    expect(within(priority).getByText("Travel conversation")).toBeInTheDocument();
    expect(within(priority).getByRole("link", { name: "Ver minha aula" })).toHaveAttribute("href", APP_PATHS.lessons);
    expect(screen.queryByText("Outdated scheduled lesson")).not.toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Aulas concluídas na trilha" })).toHaveAttribute("aria-valuenow", "1");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuemax", "3");
  });

  it("keeps a zero review count from the vocabulary API instead of replacing it with older lesson words", async () => {
    mockData({ lessons: [{ ...lesson, new_words: [{ id: "word", word: "travel", meaning: "viajar", status: "hard" }] }] });
    renderHome();
    expect(await screen.findByText("Revisão em dia")).toBeInTheDocument();
    expect(screen.queryByText("1 para revisar")).not.toBeInTheDocument();
  });

  it("offers useful practice and all existing student areas when there is no scheduled work", async () => {
    mockData();
    renderHome();
    expect(await screen.findByRole("heading", { name: "Um pouco de prática faz a diferença" })).toBeInTheDocument();
    expect(screen.getByText("Sua próxima aula aparece aqui")).toBeInTheDocument();
    for (const path of [APP_PATHS.lessons, APP_PATHS.homework, APP_PATHS.learnedWords, APP_PATHS.interpreter, APP_PATHS.vocabularyGame, APP_PATHS.calendar, APP_PATHS.finance, APP_PATHS.marketplace]) {
      expect(screen.getAllByRole("link").some((link) => link.getAttribute("href") === path)).toBe(true);
    }
  });

  it("shows unavailable data honestly and recovers after retry", async () => {
    mockedGet.mockRejectedValue(new Error("Offline"));
    renderHome();
    expect(await screen.findByRole("alert")).toHaveTextContent("Algumas informações não carregaram.");
    expect(screen.getByText("Sua agenda está indisponível")).toBeInTheDocument();
    expect(screen.queryByText("Sua próxima aula aparece aqui")).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(2);
    mockData({ lessons: [lesson] });
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(screen.getByText("Com Julia")).toBeInTheDocument();
  });

  it("shows loading instead of invented counts or a false empty state", () => {
    mockedGet.mockImplementation(() => new Promise(() => {}));
    renderHome();
    expect(screen.getByRole("status", { name: "Carregando seu próximo passo" })).toBeInTheDocument();
    expect(screen.queryByText("Sua próxima aula aparece aqui")).not.toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(2);
  });
});
