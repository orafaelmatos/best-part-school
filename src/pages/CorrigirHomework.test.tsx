import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import CorrigirHomework from "./CorrigirHomework";
import { HomeworkPanel } from "@/components/HomeworkPanel";
import { api } from "@/lib/api";

vi.mock("@/components/DashboardLayout", () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { user_id: "teacher-1", role: "teacher" } }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), delete: vi.fn() } }));

const pending = {
  id: "pending-1", title: "Homework enviada para Ana", status: "pending",
  student: "student-1", student_name: "Ana", teacher: "teacher-1", lesson: "lesson-1",
  auto_correction_enabled: false, questions: [], answers: [],
};
const other = { ...pending, id: "pending-2", title: "Outra homework" };

function setup(element: ReactNode, items = [pending, other]) {
  let homeworks = [...items];
  vi.mocked(api.get).mockImplementation(async (url) => {
    if (String(url).startsWith("/homework/?")) return { data: { results: homeworks } };
    if (url === "/homework-templates/" || url === "/lessons/") return { data: [] };
    const homework = homeworks.find((item) => url === `/homework/${item.id}/`);
    if (homework) return { data: homework };
    throw new Error(`Unexpected GET ${url}`);
  });
  vi.mocked(api.delete).mockImplementation(async (url) => {
    homeworks = homeworks.filter((item) => url !== `/homework/${item.id}/`);
    return { data: undefined };
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
}

afterEach(() => { cleanup(); vi.resetAllMocks(); });

describe("Exclusão nas telas do professor", () => {
  it("removes a sent assignment from the list while preserving the other assignments", async () => {
    setup(<CorrigirHomework />);
    fireEvent.click(await screen.findByRole("button", { name: `Excluir homework ${pending.title}` }));
    fireEvent.click(screen.getByRole("button", { name: "Excluir homework" }));

    await waitFor(() => expect(screen.queryByRole("heading", { name: pending.title })).not.toBeInTheDocument());
    expect(screen.getByRole("heading", { name: other.title })).toBeInTheDocument();
    expect(api.delete).toHaveBeenCalledExactlyOnceWith("/homework/pending-1/");
  });

  it("returns to the list when the homework open for correction is deleted", async () => {
    setup(<CorrigirHomework />, [{ ...pending, status: "sent" }]);
    fireEvent.click(await screen.findByRole("button", { name: "Avaliar" }));
    expect(await screen.findByRole("heading", { name: "Corrigir Atividade" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: `Excluir homework ${pending.title}` }));
    fireEvent.click(screen.getByRole("button", { name: "Excluir homework" }));

    expect(await screen.findByRole("heading", { name: "Homework" })).toBeInTheDocument();
    expect(await screen.findByText("Nenhuma atividade encontrada.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Corrigir Atividade" })).not.toBeInTheDocument();
  });

  it("also removes the homework from the lesson panel and refreshes its parent", async () => {
    const onUpdated = vi.fn();
    setup(<HomeworkPanel lesson={{ id: "lesson-1", student: "student-1", teacher: "teacher-1" }} onUpdated={onUpdated} />);
    fireEvent.click(await screen.findByRole("button", { name: `Excluir homework ${pending.title}` }));
    fireEvent.click(screen.getByRole("button", { name: "Excluir homework" }));

    await waitFor(() => expect(screen.queryByRole("heading", { name: pending.title })).not.toBeInTheDocument());
    expect(screen.getByRole("heading", { name: other.title })).toBeInTheDocument();
    expect(onUpdated).toHaveBeenCalledOnce();
  });
});
