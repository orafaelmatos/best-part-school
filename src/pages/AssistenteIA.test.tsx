import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import AssistenteIA from "@/pages/AssistenteIA";
import { api } from "@/lib/api";
import { buildNewModePath, buildSessionPath } from "@/lib/aiStudy";
import { APP_PATHS } from "@/lib/routes";
import { reviewActivityChoices } from "@/lib/lessonReview";

vi.mock("@/components/DashboardLayout", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/AudioPlayer", () => ({
  default: () => <div>audio-player</div>,
}));

vi.mock("@/components/MicRecorder", () => ({
  default: () => <div>mic-recorder</div>,
}));

vi.mock("@/components/PronunciationFeedback", () => ({
  default: () => <div>pronunciation-feedback</div>,
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { role: "teacher" } }),
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

const sessionSummary = {
  id: "session-1",
  mode: "review" as const,
  title: "Conversation archive",
  title_source: "manual" as const,
  is_pinned: false,
  status: "active",
  lesson: "lesson-1",
  lesson_detail: {
    id: "lesson-1",
    title: "Simple Past Review",
    level: "A2",
    teacher_name: "Teacher One",
  },
  message_count: 3,
  last_interaction_at: "2026-05-30T10:00:00.000Z",
  created_at: "2026-05-30T10:00:00.000Z",
  updated_at: "2026-05-30T10:00:00.000Z",
};

const lessonOption = {
  id: "lesson-1",
  title: "Simple Past Review",
  level: "A2",
  teacher_name: "Teacher One",
  summary_short: "Reviewing yesterday and last week.",
  flashcard_count: 8,
};

const sessionDetail = {
  ...sessionSummary,
  title: "Grammar Clinic",
  messages: [],
};

const translatableSessionDetail = {
  ...sessionSummary,
  id: "session-translate",
  title: "Translation Practice",
  messages: [
    {
      id: "message-translate",
      role: "assistant" as const,
      content_type: "text" as const,
      text: "I have been working on this project since last Monday.",
      created_at: "2026-05-30T10:00:00.000Z",
    },
  ],
};

const guidedSpeakingSessionDetail = {
  ...sessionSummary,
  id: "session-speaking",
  mode: "speaking" as const,
  title: "Speaking Guiado",
  lesson: null,
  lesson_detail: null,
  guided_state: {
    enabled: true,
    stage: "choose_scenario",
    expected_input: "choice",
    input_placeholder: "Escolha um cenario ou escreva o seu.",
  },
  messages: [
    {
      id: "message-1",
      role: "assistant" as const,
      content_type: "text" as const,
      text: "Vamos praticar ingles!\n\nPrimeiro escolha um cenario para nossa aula.",
      metadata: {
        guided: true,
        stage: "choose_scenario",
        choice_layout: "grid",
        choices: [
          {
            id: "restaurant",
            label: "Restaurante",
            value: "restaurant",
            action_type: "scenario",
            emoji: "🍽",
            description: "Pedir mesa e comida.",
          },
          {
            id: "airport",
            label: "Aeroporto",
            value: "airport",
            action_type: "scenario",
            emoji: "✈️",
            description: "Bagagem e embarque.",
          },
        ],
      },
      created_at: "2026-05-30T10:00:00.000Z",
    },
  ],
};

const newSessionDetail = {
  ...sessionSummary,
  id: "session-new",
  title: "New lesson chat",
  lesson_detail: {
    id: "lesson-1",
    title: "Simple Past Review",
    level: "A2",
    teacher_name: "Teacher One",
  },
  message_count: 0,
  messages: [],
};

const LocationDisplay = () => {
  const location = useLocation();
  return <div data-testid="location-display">{`${location.pathname}${location.search}`}</div>;
};

const renderAssistente = (initialEntry: string) => {
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
            path={APP_PATHS.aiPractice}
            element={
              <>
                <AssistenteIA />
                <LocationDisplay />
              </>
            }
          />
          <Route
            path={`${APP_PATHS.aiPractice}/conversa/:sessionId`}
            element={
              <>
                <AssistenteIA />
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

const reviewWelcome = {
  ...sessionDetail,
  guided_state: { enabled: true, stage: "choose_activity", review_revision: 0 },
  messages: [{ id: "welcome", role: "assistant", content_type: "text", text: "Vamos revisar sua aula? Escolha como você quer praticar hoje:",
    metadata: { guided: true, choices: reviewActivityChoices, choice_layout: "grid" } }],
};

const mockReview = (detail: Record<string, unknown>) => {
  mockedGet.mockImplementation(async (url) => {
    if (url === "/ai-study/sessions/session-1/") return { data: detail };
    if (url === "/ai-study/context-lessons/") return { data: [lessonOption] };
    if (url === "/ai-study/sessions/") return { data: [sessionSummary] };
    return { data: [] };
  });
};

describe("guided lesson review", () => {
  it("starts an activity from a card and removes obsolete choices while keeping the composer", async () => {
    mockReview(reviewWelcome);
    mockedPost.mockResolvedValue({ data: {
      session: { ...sessionSummary, guided_state: { enabled: true, stage: "awaiting_answer", review_activity: "grammar", review_revision: 1 } },
      user_message: { id: "choice", role: "user", content_type: "text", text: "Revisar gramática" },
      assistant_message: { id: "task", role: "assistant", content_type: "text", text: "Complete: Yesterday I ___ to school.", metadata: { guided: true, choices: [], expected_input: "text" } },
    } });
    renderAssistente(buildSessionPath("session-1"));
    fireEvent.click(await screen.findByRole("button", { name: /Revisar gramática/ }));
    expect(await screen.findByText("Complete: Yesterday I ___ to school.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Traduzir frases/ })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBeEnabled();
    expect(mockedPost).toHaveBeenCalledWith("/ai-study/sessions/session-1/message/", expect.objectContaining({
      review_revision: 0, guided_action: { action_type: "review_activity", value: "grammar", label: "Revisar gramática" },
    }));
  });

  it("submits a quiz alternative with the current revision", async () => {
    mockReview({ ...reviewWelcome, guided_state: { enabled: true, review_revision: 3 }, messages: [{
      id: "quiz", role: "assistant", content_type: "text", text: "Qual é o passado de go?", metadata: {
        guided: true, choices: ["went", "go", "goes", "going"].map((label, i) => ({ id: String(i), label: `${"ABCD"[i]}. ${label}`, value: "ABCD"[i], action_type: "review_answer" })),
      },
    }] });
    mockedPost.mockResolvedValue({ data: {
      session: { ...sessionSummary, guided_state: { enabled: true, review_revision: 4, stage: "feedback", correct_count: 1 } },
      assistant_message: { id: "feedback", role: "assistant", content_type: "text", text: "Correto: went é o passado de go.", metadata: {
        guided: true, choices: [{ id: "next", label: "Próxima atividade", value: "next", action_type: "review_control" }],
      } },
    } });
    renderAssistente(buildSessionPath("session-1"));
    fireEvent.click(await screen.findByRole("button", { name: "A. went" }));
    expect(await screen.findByText("Correto: went é o passado de go.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Próxima atividade" })).toBeInTheDocument();
    expect(mockedPost).toHaveBeenCalledTimes(1);
    expect(mockedPost).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ review_revision: 3 }));
  });

  it("keeps a failed text answer available for retry", async () => {
    mockReview(reviewWelcome);
    mockedPost.mockRejectedValue(new Error("IA indisponível"));
    renderAssistente(buildSessionPath("session-1"));
    const input = await screen.findByRole("textbox");
    fireEvent.change(input, { target: { value: "Pode explicar o passado?" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar mensagem" }));
    await waitFor(() => expect(input).toHaveValue("Pode explicar o passado?"));
    expect(screen.getByRole("button", { name: /Revisar gramática/ })).toBeEnabled();
  });

  it("plays review listening audio without exposing a transcript", async () => {
    mockReview({ ...reviewWelcome, messages: [{ id: "listening", role: "assistant", content_type: "text", text: "Where did the speaker go?",
      metadata: { guided: true, choices: [], review_audio_url: "/media/listening.mp3" } }] });
    renderAssistente(buildSessionPath("session-1"));
    expect(await screen.findByText("audio-player")).toBeInTheDocument();
    expect(screen.getByText("Where did the speaker go?")).toBeInTheDocument();
    expect(screen.queryByText("Transcrição")).not.toBeInTheDocument();
  });

  it("enables the microphone for speaking inside a lesson review", async () => {
    mockReview({ ...reviewWelcome, guided_state: { enabled: true, stage: "awaiting_answer", expected_input: "audio_or_text", review_activity: "speaking" }, messages: [{
      id: "speaking", role: "assistant", content_type: "text", text: "Tell me about your trip.", metadata: { guided: true, choices: [], expected_input: "audio_or_text" },
    }] });
    renderAssistente(buildSessionPath("session-1"));
    fireEvent.click(await screen.findByRole("button", { name: "Abrir microfone" }));
    expect(screen.getByText("mic-recorder")).toBeInTheDocument();
  });

  it("finishes the review, shows the saved report and prevents further answers", async () => {
    mockReview(reviewWelcome);
    mockedPost.mockResolvedValue({ data: {
      session: { ...sessionSummary, status: "completed", review_report: {
        id: "report", lesson_title: "Travel lesson", completed_at: "2026-10-29T13:00:00Z", duration_seconds: 125,
        correct_count: 2, incorrect_count: 1, difficulties: [{ topic: "Irregular past", count: 1 }], activities: ["grammar"], attempts: [],
      } },
      assistant_message: { id: "finished", role: "assistant", content_type: "text", text: "Revisão finalizada!" },
    } });
    renderAssistente(buildSessionPath("session-1"));
    fireEvent.click(await screen.findByRole("button", { name: "Finalizar revisão" }));
    expect(await screen.findByRole("region", { name: "Relatório da revisão" })).toBeInTheDocument();
    expect(screen.getByText("2min 5s")).toBeInTheDocument();
    expect(screen.getByText(/Irregular past/)).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Revisar gramática/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nova revisão" })).toBeInTheDocument();
  });
});

describe("AssistenteIA routing flow", () => {
  it("shows the new practice picker on the workspace root even when sessions exist", async () => {
    mockedGet.mockImplementation(async (url) => {
      if (url === "/ai-study/sessions/") {
        return { data: [sessionSummary] };
      }
      if (url === "/ai-study/context-lessons/") {
        return { data: [lessonOption] };
      }
      throw new Error(`Unexpected GET ${url}`);
    });

    renderAssistente(APP_PATHS.aiPractice);

    expect(await screen.findByText("Como quer praticar?")).toBeInTheDocument();
    expect(screen.queryByText("Escolha uma conversa ou crie uma nova")).not.toBeInTheDocument();
  });

  it("shows the lesson picker when opening a new conversation", async () => {
    mockedGet.mockImplementation(async (url) => {
      if (url === "/ai-study/sessions/") {
        return { data: [sessionSummary] };
      }
      if (url === "/ai-study/context-lessons/") {
        return { data: [lessonOption] };
      }
      throw new Error(`Unexpected GET ${url}`);
    });

    renderAssistente(buildNewModePath());

    expect(await screen.findByText("Como quer praticar?")).toBeInTheDocument();
    fireEvent.click((await screen.findAllByRole("button", { name: /Revisar Aula/i }))[0]);

    expect(await screen.findByText("Reviewing yesterday and last week.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Praticar esta aula" })[0]).toBeInTheDocument();
    expect(screen.getByTestId("location-display")).toHaveTextContent(buildNewModePath("review"));
  });

  it("renders the dedicated chat page for a conversation route", async () => {
    mockedGet.mockImplementation(async (url) => {
      if (url === "/ai-study/sessions/") {
        return { data: [sessionSummary] };
      }
      if (url === "/ai-study/context-lessons/") {
        return { data: [lessonOption] };
      }
      if (url === "/ai-study/sessions/session-1/") {
        return { data: sessionDetail };
      }
      throw new Error(`Unexpected GET ${url}`);
    });

    renderAssistente(buildSessionPath("session-1"));

    expect(await screen.findByText("Grammar Clinic")).toBeInTheDocument();
    expect(screen.getByText("Vamos revisar sua aula? Escolha como você quer praticar hoje:")).toBeInTheDocument();
    for (const choice of reviewActivityChoices) expect(screen.getByRole("button", { name: new RegExp(choice.label) })).toBeInTheDocument();
    expect(screen.queryByText("Converse com a IA usando o contexto real das suas aulas")).not.toBeInTheDocument();
  });

  it("renders guided onboarding choices inside a speaking conversation", async () => {
    mockedGet.mockImplementation(async (url) => {
      if (url === "/ai-study/sessions/") {
        return { data: [sessionSummary] };
      }
      if (url === "/ai-study/context-lessons/") {
        return { data: [lessonOption] };
      }
      if (url === "/ai-study/sessions/session-speaking/") {
        return { data: guidedSpeakingSessionDetail };
      }
      throw new Error(`Unexpected GET ${url}`);
    });

    renderAssistente(buildSessionPath("session-speaking"));

    expect(await screen.findByText("Speaking Guiado")).toBeInTheDocument();
    expect(screen.getByText(/Primeiro escolha um cenario para nossa aula\./i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Restaurante/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Aeroporto/i })).toBeInTheDocument();
  });

  it("shows a translation popover when selecting assistant text", async () => {
    mockedGet.mockImplementation(async (url) => {
      if (url === "/ai-study/sessions/") {
        return { data: [sessionSummary] };
      }
      if (url === "/ai-study/context-lessons/") {
        return { data: [lessonOption] };
      }
      if (url === "/ai-study/sessions/session-translate/") {
        return { data: translatableSessionDetail };
      }
      throw new Error(`Unexpected GET ${url}`);
    });

    mockedPost.mockImplementation(async (url) => {
      if (url === "/ai-study/sessions/session-translate/translate-selection/") {
        return { data: { translation: "Tenho trabalhado neste projeto desde segunda-feira passada." } };
      }
      throw new Error(`Unexpected POST ${url}`);
    });

    renderAssistente(buildSessionPath("session-translate"));

    const assistantText = await screen.findByText("I have been working on this project since last Monday.");
    const textNode = assistantText.firstChild;
    expect(textNode).not.toBeNull();

    const getBoundingClientRect = vi.fn(() => ({
      width: 180,
      height: 24,
      top: 120,
      left: 80,
      right: 260,
      bottom: 144,
      x: 80,
      y: 120,
      toJSON: () => ({}),
    }));

    const selectionMock = {
      isCollapsed: false,
      rangeCount: 1,
      anchorNode: textNode,
      focusNode: textNode,
      toString: () => "I have been working on this project since last Monday.",
      getRangeAt: () => ({
        getBoundingClientRect,
      }),
    };

    const selectionSpy = vi.spyOn(window, "getSelection").mockReturnValue(selectionMock as unknown as Selection);

    fireEvent.mouseUp(assistantText);

    expect(await screen.findByTestId("translation-popover")).toBeInTheDocument();
    expect(await screen.findByText("Tenho trabalhado neste projeto desde segunda-feira passada.")).toBeInTheDocument();
    selectionSpy.mockRestore();
  });

  it("navigates to the dedicated chat route after creating a session", async () => {
    mockedGet.mockImplementation(async (url) => {
      if (url === "/ai-study/sessions/") {
        return { data: [sessionSummary] };
      }
      if (url === "/ai-study/context-lessons/") {
        return { data: [lessonOption] };
      }
      if (url === "/ai-study/sessions/session-new/") {
        return { data: newSessionDetail };
      }
      throw new Error(`Unexpected GET ${url}`);
    });

    mockedPost.mockImplementation(async (url) => {
      if (url === "/ai-study/sessions/") {
        return { data: newSessionDetail };
      }
      throw new Error(`Unexpected POST ${url}`);
    });

    renderAssistente(buildNewModePath());

    fireEvent.click((await screen.findAllByRole("button", { name: /Revisar Aula/i }))[0]);
    fireEvent.click((await screen.findAllByRole("button", { name: "Praticar esta aula" }))[0]);

    await waitFor(() => {
      expect(screen.getByTestId("location-display")).toHaveTextContent(buildSessionPath("session-new"));
    });
    expect(await screen.findByText("New lesson chat")).toBeInTheDocument();
  });
});
