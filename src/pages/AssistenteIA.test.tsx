import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import AssistenteIA from "@/pages/AssistenteIA";
import { api } from "@/lib/api";
import { buildNewModePath, buildSessionPath } from "@/lib/aiStudy";
import { APP_PATHS } from "@/lib/routes";

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

    expect(await screen.findByText("Escolha como você quer praticar")).toBeInTheDocument();
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

    expect(await screen.findByText("Escolha como você quer praticar")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: /Revisar Aula/i }));

    expect(await screen.findByText("Reviewing yesterday and last week.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Praticar esta aula" })).toBeInTheDocument();
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
    expect(screen.getByText("O que você quer revisar nesta aula?")).toBeInTheDocument();
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

    fireEvent.click(await screen.findByRole("button", { name: /Revisar Aula/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Praticar esta aula" }));

    await waitFor(() => {
      expect(screen.getByTestId("location-display")).toHaveTextContent(buildSessionPath("session-new"));
    });
    expect(await screen.findByText("New lesson chat")).toBeInTheDocument();
  });
});
