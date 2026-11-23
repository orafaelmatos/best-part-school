import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import AnotarAula from "./AnotarAula";
import { api } from "@/lib/api";

const toast = vi.hoisted(() => vi.fn());
vi.mock("@/components/DashboardLayout", () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/FlashcardEditor", () => ({ FlashcardEditor: () => null }));
vi.mock("@/components/HomeworkPanel", () => ({ HomeworkPanel: () => null }));
vi.mock("@/components/PastLessonSummary", () => ({ default: () => null }));
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { user_id: "teacher-1", role: "teacher" } }) }));
vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), patch: vi.fn() } }));
vi.mock("react-quill", async () => {
  const { forwardRef, useImperativeHandle, useRef } = await import("react");
  return {
    Quill: { import: () => class { static create() { return document.createElement("div"); } }, register: vi.fn() },
    default: forwardRef(({ value, onChange }: { value: string; onChange: (value: string) => void }, ref) => {
      const editor = useRef({ root: document.createElement("div"), on: vi.fn(), off: vi.fn() });
      useImperativeHandle(ref, () => ({ getEditor: () => editor.current }), []);
      return <textarea aria-label="Lousa" value={value} onChange={(event) => onChange(event.target.value)} />;
    }),
  };
});

const get = vi.mocked(api.get), patch = vi.mocked(api.patch);
const base = { teacher: "teacher-1", level: "A2", is_template: false, student: null, group: "group-a", student_name: "Turma A", group_name: "Turma A", group_student_ids: ["student-1"], new_words: [], attachments: [] };
const current = { ...base, id: "current", title: "Aula atual", status: "in_progress", date: "2026-11-09T22:30:00Z", notes: "<p>Anotações atuais.</p>", order: 2 };
const past = { ...base, id: "past", title: "Aula anterior da turma", status: "completed", date: "2026-11-02T22:30:00Z", notes: "<p>Conteúdo da turma na semana passada.</p>", order: 1 };
const future = { ...base, id: "future", title: "Próxima aula da turma", status: "pending", notes: "", date: null, order: 3 };
const lessons = [current, past, future];
const Location = () => { const value = useLocation(); return <p data-testid="location">{value.pathname}{value.search}</p>; };

function setup(entry = "/app/aulas/current/anotar?from=calendar", items = lessons, respectGroupFilter = true) {
  get.mockImplementation(async (url, config) => {
    if (url === "/accounts/users/") return { data: [] };
    if (url === "/lessons/") return { data: items.filter((lesson) => respectGroupFilter && config?.params?.group ? lesson.group === config.params.group : true) };
    const id = String(url).split("/")[2];
    const lesson = items.find((item) => item.id === id);
    if (lesson) return { data: lesson };
    throw new Error(`Unexpected GET ${url}`);
  });
  patch.mockImplementation(async (url, data) => ({ data: { ...items.find(item => String(url).includes(item.id)), ...(data as Record<string, unknown>) } }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[entry]}><Routes>
    <Route path="/app/aulas/:id/anotar" element={<AnotarAula />} />
  </Routes><Location /></MemoryRouter></QueryClientProvider>);
  return client;
}
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Anotações de aulas em turma", () => {
  it("loads past annotations by group when the shared lesson has no individual student", async () => {
    setup();
    await screen.findByDisplayValue(current.notes);
    fireEvent.click(screen.getByRole("button", { name: "Ver anotações aulas passadas" }));
    expect(await screen.findByRole("button", { name: /Aula anterior da turma/ })).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith("/lessons/", { params: { all: true, group: "group-a", is_template: false, ordering: "order" } });
  });

  it("keeps group and main-lesson context while opening history and returning to class", async () => {
    setup(); await screen.findByDisplayValue(current.notes);
    fireEvent.click(screen.getByRole("button", { name: "Ver anotações aulas passadas" }));
    fireEvent.click(await screen.findByRole("button", { name: /Aula anterior da turma/ }));
    expect(await screen.findByDisplayValue(past.notes)).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/app/aulas/past/anotar?group=group-a&main_lesson=current");
    fireEvent.click(screen.getByRole("button", { name: "Aula principal" }));
    expect(await screen.findByDisplayValue(current.notes)).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/app/aulas/current/anotar?group=group-a");
  });

  it("includes future group lessons when planning from the current class", async () => {
    setup(); await screen.findByDisplayValue(current.notes);
    fireEvent.click(screen.getByRole("button", { name: "Planejar aula futura" }));
    expect(await screen.findByRole("button", { name: /Próxima aula da turma/ })).toBeInTheDocument();
  });

  it("keeps the existing individual-student query and navigation", async () => {
    const individual = lessons.map(lesson => ({ ...lesson, group: null, student: "student-1", student_name: "Aluno 1" }));
    setup(undefined, individual); await screen.findByDisplayValue(current.notes);
    await waitFor(() => expect(get).toHaveBeenCalledWith("/lessons/", { params: { all: true, student: "student-1", is_template: false, ordering: "order" } }));
  });

  it("finds dated annotations even when the previous group lesson was not marked completed", async () => {
    const history = { ...past, status: "in_progress", date: new Date(Date.now() - 7 * 86400000).toISOString() };
    setup(undefined, [current, history, future]); await screen.findByDisplayValue(current.notes);
    fireEvent.click(screen.getByRole("button", { name: "Ver anotações aulas passadas" }));
    expect(await screen.findByRole("button", { name: /Aula anterior da turma/ })).toBeInTheDocument();
  });

  it("never mixes other groups into the history even if an older API returns unfiltered lessons", async () => {
    setup(undefined, [...lessons, { ...past, id: "other", group: "group-b", title: "Outra turma" }], false);
    await screen.findByDisplayValue(current.notes);
    fireEvent.click(screen.getByRole("button", { name: "Ver anotações aulas passadas" }));
    expect(await screen.findByRole("button", { name: /Aula anterior da turma/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Outra turma/ })).not.toBeInTheDocument();
  });

  it("blocks editing when a history URL is opened in a different group's context", async () => {
    setup("/app/aulas/current/anotar?group=group-b");
    expect(await screen.findByText("Aula fora do contexto da turma")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Lousa" })).not.toBeInTheDocument();
    expect(patch).not.toHaveBeenCalled();
  });
});
