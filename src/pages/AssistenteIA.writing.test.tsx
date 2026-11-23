import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AssistenteIA from "@/pages/AssistenteIA";
import { api } from "@/lib/api";
import { buildSessionPath } from "@/lib/aiStudy";
import { APP_PATHS } from "@/lib/routes";
import { writingActivityFixture, writingCorrectionFixture, writingReportFixture } from "@/test/writing";

vi.mock("@/components/DashboardLayout", () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { role: "student" } }) }));
vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }));

const detail = () => ({
  id: "writing", mode: "writing", title: "Writing - Turismo", title_source: "auto", is_pinned: false, status: "active", message_count: 1,
  guided_state: { enabled: true, stage: "active", level: "A1", scenario_label: "Turismo", expected_input: "text_submission" },
  messages: [{ id: "writing-activity", role: "assistant", content_type: "text", text: "Sua vez!", metadata: {
    guided: true, expected_input: "text_submission", writing_activity: writingActivityFixture(),
    choices: [{ id: "hint", value: "hint", label: "Me dê uma dica", action_type: "writing_help" },
      { id: "end_session", value: "end_session", label: "Finalizar prática", action_type: "session_control" }],
  } }],
});

const show = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
  <MemoryRouter initialEntries={[buildSessionPath("writing")]}><Routes>
    <Route path={`${APP_PATHS.aiPractice}/conversa/:sessionId`} element={<AssistenteIA />} />
  </Routes></MemoryRouter>
</QueryClientProvider>);

describe("Writing lesson integration", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockImplementation(async (url) => {
      if (url === "/ai-study/sessions/") return { data: [detail()] };
      if (url === "/ai-study/sessions/writing/") return { data: detail() };
      if (url === "/ai-study/progress/overview/") return { data: { speaking_history: [], writing_history: [] } };
      return { data: [] };
    });
  });
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it("teaches before the task, then displays the actual correction and one next exercise", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: {
      session: detail(), user_message: { id: "answer", role: "user", content_type: "text", text: "I want visit London." },
      assistant_message: { ...detail().messages[0], id: "correction-next", metadata: {
        ...detail().messages[0].metadata, writing_correction: writingCorrectionFixture(),
        writing_activity: { ...writingActivityFixture(), id: "activity-2", number: 2,
          instruction: "Agora escreva que você quer visitar Paris." },
      } },
    } });
    show();
    const activity = await screen.findByRole("region", { name: "Atividade de Writing" });
    expect(within(activity).getByText("I want")).toBeVisible();
    expect(within(activity).getByText("I want to visit")).toBeVisible();
    expect(within(activity).getByText("Exemplo resolvido")).toBeVisible();
    const input = screen.getByRole("textbox", { name: "Sua resposta por texto" });
    fireEvent.change(input, { target: { value: "I want visit London." } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar mensagem" }));
    const correction = await screen.findByRole("region", { name: "Correção da sua resposta" });
    expect(within(correction).getByText(/Depois de want, usamos to/)).toBeVisible();
    expect(within(correction).getByText("to", { selector: "mark" })).toBeVisible();
    expect(screen.getByText("Agora escreva que você quer visitar Paris.")).toBeVisible();
    expect(screen.getAllByRole("button", { name: "Me dê uma dica" })).toHaveLength(1);
    expect(api.post).toHaveBeenCalledWith("/ai-study/sessions/writing/message/", expect.objectContaining({ text: "I want visit London." }));
  });

  it("keeps the draft while asking for help about the active exercise", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { session: detail(), assistant_message: {
      ...detail().messages[0], id: "help", metadata: { ...detail().messages[0].metadata,
        writing_help: { action: "hint", label: "Me dê uma dica", text: "Depois de I want, use to visit." },
      },
    } } });
    show();
    const input = await screen.findByRole("textbox", { name: "Sua resposta por texto" });
    fireEvent.change(input, { target: { value: "I want" } });
    fireEvent.click(screen.getByRole("button", { name: "Me dê uma dica" }));
    expect(await screen.findByRole("complementary", { name: "Me dê uma dica" })).toHaveTextContent("use to visit");
    expect(input).toHaveValue("I want");
    expect(api.post).toHaveBeenCalledWith("/ai-study/sessions/writing/message/", expect.objectContaining({
      guided_action: { action_type: "writing_help", value: "hint", label: "Me dê uma dica" },
    }));
  });

  it("restores a written answer after a failed request", async () => {
    vi.mocked(api.post).mockRejectedValue(new Error("unavailable"));
    show();
    const input = await screen.findByRole("textbox", { name: "Sua resposta por texto" });
    fireEvent.change(input, { target: { value: "I want to visit London." } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar mensagem" }));
    await waitFor(() => expect(input).toHaveValue("I want to visit London."));
    expect(screen.getByRole("region", { name: "Atividade de Writing" })).toBeVisible();
  });

  it("finishes with the saved learning report and a new-scenario option", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: {
      session: { ...detail(), status: "completed", guided_state: { stage: "completed", expected_input: "choice" } },
      assistant_message: { id: "report", role: "assistant", content_type: "text", text: "Prática finalizada.", metadata: {
        guided: true, expected_input: "choice", writing_report: writingReportFixture(),
        choices: [{ id: "new_scenario", value: "new_scenario", label: "Novo cenário", action_type: "session_control" }],
      } },
    } });
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Finalizar prática" }));
    const report = await screen.findByRole("region", { name: "Resumo de Writing" });
    expect(within(report).getByText("Estruturas trabalhadas")).toBeVisible();
    expect(within(report).getByText("Revise want to com outros destinos.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Novo cenário" })).toBeVisible();
    expect(screen.queryByRole("textbox", { name: "Sua resposta por texto" })).not.toBeInTheDocument();
  });
});
