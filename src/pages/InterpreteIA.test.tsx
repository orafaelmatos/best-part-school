import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import InterpreteIA from "@/pages/InterpreteIA";
import { api } from "@/lib/api";
import { buildInterpreterSessionPath } from "@/lib/aiStudy";
import { APP_PATHS } from "@/lib/routes";
import { interpreterFeedback, interpreterSession } from "@/test/interpreter";

vi.mock("@/components/DashboardLayout", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/AudioPlayer", () => ({
  default: () => <div>audio-player</div>,
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { user_id: "student-1", role: "student" } }),
}));

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockedGet = vi.mocked(api.get);
const mockedPost = vi.mocked(api.post);

const listeningSummary = {
  id: "session-listening",
  mode: "listening" as const,
  title: "Interprete IA - Restaurante",
  title_source: "auto" as const,
  is_pinned: false,
  status: "active",
  lesson: null,
  lesson_detail: null,
  message_count: 1,
  guided_state: {
    enabled: true,
    stage: "active",
    scenario_label: "Restaurante",
    level: "B1",
    progress_summary: "Audio 1 pronto. Etapa 1 de 6: Chegada ao restaurante.",
    listening_journey: {
      current_step_index: 0,
      completed_step_ids: [],
      current_step_status: "active",
      steps: [
        { id: "arrival", label: "Chegada ao restaurante" },
        { id: "table", label: "Pedido de mesa" },
        { id: "menu", label: "Leitura do cardapio" },
        { id: "drinks", label: "Pedido de bebidas" },
        { id: "meal", label: "Pedido principal" },
        { id: "bill", label: "Conta e encerramento" },
      ],
    },
  },
  last_interaction_at: "2026-06-29T10:00:00.000Z",
  created_at: "2026-06-29T10:00:00.000Z",
  updated_at: "2026-06-29T10:00:00.000Z",
};

const listeningDetail = {
  ...listeningSummary,
  messages: [
    {
      id: "message-1",
      role: "assistant" as const,
      content_type: "text" as const,
      text: "Could I have a table for two, please?",
      created_at: "2026-06-29T10:00:00.000Z",
      metadata: {
        mode: "listening",
        interpreter: true,
        interpreter_exercise: {
          id: "exercise-1",
          round: 1,
          scenario_key: "restaurant",
          scenario_label: "Restaurante",
          level: "B1",
          instructions: "Listen carefully and type what you hear.",
          tts_audio_url: "/media/ai_study/tts/sample.mp3",
          correct_option_id: "option-1",
          focus_words: ["table", "please"],
          step_id: "arrival",
          step_title: "Chegada ao restaurante",
          step_prompt: "O aluno esta chegando ao restaurante e precisa entender a recepcao inicial.",
          step_index: 1,
          step_total: 6,
          is_final_step: false,
          journey_steps: [
            { id: "arrival", label: "Chegada ao restaurante" },
            { id: "table", label: "Pedido de mesa" },
            { id: "menu", label: "Leitura do cardapio" },
            { id: "drinks", label: "Pedido de bebidas" },
            { id: "meal", label: "Pedido principal" },
            { id: "bill", label: "Conta e encerramento" },
          ],
          response_mode_choices: [
            { id: "multiple_choice", label: "Com alternativas" },
            { id: "transcription", label: "Escrever sozinho" },
          ],
          options: [
            { id: "option-1", text: "Could I have a table for two, please?" },
            { id: "option-2", text: "Could I have a table for three, please?" },
            { id: "option-3", text: "Can I book a hotel room, please?" },
            { id: "option-4", text: "Could I order a coffee for two?" },
          ],
        },
      },
    },
  ],
};

const LocationDisplay = () => {
  const location = useLocation();
  return <div data-testid="location-display">{location.pathname}</div>;
};

const renderInterpreter = (initialEntry: string) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route
            path={APP_PATHS.interpreter}
            element={
              <>
                <InterpreteIA />
                <LocationDisplay />
              </>
            }
          />
          <Route
            path={`${APP_PATHS.interpreter}/conversa/:sessionId`}
            element={
              <>
                <InterpreteIA />
                <LocationDisplay />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

beforeEach(() => { vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined); });
afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("InterpreteIA", () => {
  it("creates simultaneous practice with the selected speech duration and playback rate", async () => {
    mockedGet.mockResolvedValue({ data: [] });
    mockedPost.mockResolvedValue({ data: interpreterSession });
    renderInterpreter(APP_PATHS.interpreter);
    fireEvent.click(await screen.findByRole("button", { name: /Interpretação simultânea Avançado/ }));
    fireEvent.change(screen.getByLabelText("Duração da fala simultânea"), { target: { value: "90" } });
    fireEvent.change(screen.getByLabelText("Velocidade inicial da simultânea"), { target: { value: "0.75" } });
    fireEvent.click(screen.getByRole("button", { name: "Iniciar interpretação" }));
    await waitFor(() => expect(mockedPost).toHaveBeenCalledWith("/ai-study/sessions/", expect.objectContaining({
      interpreter_settings: expect.objectContaining({ interpretation_mode: "simultaneous", segment_duration_seconds: 90, playback_speed: 0.75 }),
    })));
  });

  it("persists direction, guided support, free duration and optional vocabulary when creating a simulator", async () => {
    const ready = structuredClone(interpreterSession);
    ready.guided_state!.interpreter!.status = "ready";
    ready.guided_state!.interpreter!.active_turn_id = null;
    ready.messages = [];
    mockedGet.mockImplementation(async (url) => ({ data: String(url).includes("session-v2/") ? ready : [] }));
    mockedPost.mockResolvedValue({ data: ready });
    renderInterpreter(APP_PATHS.interpreter);
    fireEvent.click(await screen.findByRole("button", { name: "Português → Inglês" }));
    fireEvent.click(screen.getByRole("button", { name: /Treinamento guiado Repita/ }));
    fireEvent.click(screen.getByRole("button", { name: "C1" }));
    fireEvent.click(screen.getByRole("button", { name: "Interpretação livre" }));
    fireEvent.change(screen.getByRole("combobox", { name: /Duração aproximada/ }), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Preparar vocabulário/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Simulação real/ }));
    fireEvent.click(screen.getByRole("button", { name: "Iniciar interpretação" }));
    await waitFor(() => expect(mockedPost).toHaveBeenCalledWith("/ai-study/sessions/", {
      mode: "listening", scenario_key: "preaching", scenario_label: "Pregação", level: "C1",
      interpreter_settings: { direction: "pt_en", interpretation_mode: "guided", session_style: "free", duration_minutes: 10, prepare_vocabulary: true, realistic: true },
    }));
    expect(await screen.findByRole("heading", { name: "Preparar vocabulário" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "blessing — bênção" })).toBeInTheDocument();
  });

  it("resumes a simulator, submits an interpretation and waits for Próxima fala", async () => {
    const saved = structuredClone(interpreterSession);
    mockedGet.mockImplementation(async (url) => ({ data: String(url).includes("session-v2/") ? saved : [] }));
    const evaluated = structuredClone(saved);
    evaluated.messages.push({ id: "answer-v2", role: "user", text: "Que bênção estar com vocês esta noite!", metadata: { interpreter_answer: { challenge_id: "turn-1", response_mode: "text" } } },
      { id: "feedback-v2", role: "assistant", text: interpreterFeedback.summary, metadata: { interpretation_feedback: interpreterFeedback } });
    mockedPost.mockResolvedValue({ data: evaluated });
    renderInterpreter(buildInterpreterSessionPath("session-v2"));
    expect(await screen.findByText("Sua vez! Interprete para o português.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ver transcrição original" }));
    fireEvent.click(screen.getByRole("button", { name: "Escrever sozinho" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Sua interpretação em português" }), { target: { value: "Que bênção estar com vocês esta noite!" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar interpretação" }));
    expect(await screen.findByText(interpreterFeedback.summary)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Próxima fala" })).toBeInTheDocument();
    expect(mockedPost).toHaveBeenCalledTimes(1);
    expect(mockedPost).toHaveBeenCalledWith("/ai-study/sessions/session-v2/interpreter/answer/", expect.objectContaining({ response_mode: "text", message_id: "turn-1" }));
  });

  it("creates a listening session with the selected topic and level", async () => {
    mockedGet.mockImplementation(async (url) => {
      if (url === "/ai-study/sessions/session-listening/") {
        return { data: listeningDetail };
      }
      return { data: [] };
    });
    mockedPost.mockResolvedValue({ data: listeningDetail });

    renderInterpreter(APP_PATHS.interpreter);

    expect(await screen.findByText("Dê voz à mensagem em outro idioma")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Restaurante Recepção/ }));
    fireEvent.click(screen.getByRole("button", { name: "A2" }));
    fireEvent.click(screen.getByRole("button", { name: "Iniciar interpretação" }));

    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith("/ai-study/sessions/", {
        mode: "listening",
        scenario_key: "restaurant",
        scenario_label: "Restaurante",
        level: "A2",
        interpreter_settings: {
          direction: "en_pt", interpretation_mode: "consecutive", session_style: "journey",
          duration_minutes: 5, prepare_vocabulary: false, realistic: false,
        },
      });
    });
    await waitFor(() => {
      expect(screen.getByTestId("location-display")).toHaveTextContent(buildInterpreterSessionPath("session-listening"));
    });
  });

  it("renders a saved listening challenge with answer controls", async () => {
    mockedGet.mockImplementation(async (url) => {
      if (url === "/ai-study/sessions/?modes=listening") {
        return { data: [listeningSummary] };
      }
      if (url === "/ai-study/sessions/session-listening/") {
        return { data: listeningDetail };
      }
      throw new Error(`Unexpected GET ${url}`);
    });

    renderInterpreter(buildInterpreterSessionPath("session-listening"));

    expect(await screen.findByText("Interprete IA - Restaurante")).toBeInTheDocument();
    expect(screen.getByText("Jornada guiada")).toBeInTheDocument();
    expect(screen.getAllByText("Chegada ao restaurante").length).toBeGreaterThan(0);
    expect(screen.getByText("Listen carefully and type what you hear.")).toBeInTheDocument();
    expect(screen.getByText("audio-player")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Com alternativas" }));
    fireEvent.click(screen.getByText("Could I have a table for two, please?"));
    expect(await screen.findByText("Sua resposta")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enviar resposta" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mostrar resposta" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Gerar outro audio desta etapa" })).not.toBeInTheDocument();
  });
});
