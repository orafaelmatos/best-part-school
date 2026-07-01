import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import InterpreteIA from "@/pages/InterpreteIA";
import { api } from "@/lib/api";
import { buildInterpreterSessionPath } from "@/lib/aiStudy";
import { APP_PATHS } from "@/lib/routes";

vi.mock("@/components/DashboardLayout", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/AudioPlayer", () => ({
  default: () => <div>audio-player</div>,
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
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

afterEach(() => {
  vi.clearAllMocks();
});

describe("InterpreteIA", () => {
  it("creates a listening session with the selected topic and level", async () => {
    mockedGet.mockResolvedValue({ data: [] });
    mockedPost.mockResolvedValue({ data: listeningDetail });

    renderInterpreter(APP_PATHS.interpreter);

    expect(await screen.findByText("Treine escuta com audio gerado pela IA")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "A2" }));
    fireEvent.click(screen.getByRole("button", { name: "Iniciar treino" }));

    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith("/ai-study/sessions/", {
        mode: "listening",
        scenario_key: "restaurant",
        scenario_label: "Restaurante",
        level: "A2",
      });
    });
    expect(await screen.findByTestId("location-display")).toHaveTextContent(buildInterpreterSessionPath("session-listening"));
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
    expect(screen.getByText("Listen carefully and type what you hear.")).toBeInTheDocument();
    expect(screen.getByText("audio-player")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Com alternativas" }));
    fireEvent.click(screen.getByText("Could I have a table for two, please?"));
    expect(await screen.findByText("Sua resposta")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enviar resposta" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mostrar resposta" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeInTheDocument();
  });
});
