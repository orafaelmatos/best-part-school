import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import AssistenteIA from "@/pages/AssistenteIA";
import { api } from "@/lib/api";

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
            path="/treinar-ia"
            element={
              <>
                <AssistenteIA />
                <LocationDisplay />
              </>
            }
          />
          <Route
            path="/treinar-ia/conversa/:sessionId"
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

    renderAssistente("/treinar-ia?mode=new");

    expect(await screen.findByText("Escolha como você quer praticar")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: /Revisar Aula/i }));

    expect(await screen.findByText("Selecione a aula de referência")).toBeInTheDocument();
    expect(await screen.findByText("Reviewing yesterday and last week.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Praticar esta aula" })).toBeInTheDocument();
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

    renderAssistente("/treinar-ia/conversa/session-1");

    expect(await screen.findByText("Grammar Clinic")).toBeInTheDocument();
    expect(screen.getByText("O que você quer revisar nesta aula?")).toBeInTheDocument();
    expect(screen.queryByText("Converse com a IA usando o contexto real das suas aulas")).not.toBeInTheDocument();
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

    renderAssistente("/treinar-ia?mode=new");

    fireEvent.click(await screen.findByRole("button", { name: /Revisar Aula/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Praticar esta aula" }));

    await waitFor(() => {
      expect(screen.getByTestId("location-display")).toHaveTextContent("/treinar-ia/conversa/session-new");
    });
    expect(await screen.findByText("New lesson chat")).toBeInTheDocument();
  });
});
