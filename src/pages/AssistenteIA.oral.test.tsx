import { useRef, type ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AssistenteIA from "@/pages/AssistenteIA";
import { api } from "@/lib/api";
import * as audio from "@/lib/speakingAudio";
import { APP_PATHS } from "@/lib/routes";
import { buildSessionPath } from "@/lib/aiStudy";
import { speakingReportFixture } from "@/test/speakingReport";
import { speakingFeedbackFixture } from "@/test/speakingFeedback";

vi.mock("@/components/DashboardLayout", () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/AudioPlayer", () => ({ default: () => <div>Áudio gravado</div> }));
vi.mock("@/components/MicRecorder", () => ({ default: function MockRecorder({ state, disabled, errorMessage, onRecordingComplete, onUseText }: {
  state: string; disabled: boolean; errorMessage: string; onRecordingComplete: (blob: Blob, seconds: number) => Promise<void>; onUseText: () => void;
}) {
  const clip = useRef(new Blob(["voice"], { type: "audio/mp4" }));
  return <section aria-label="Gravador conectado"><p>{`Gravador: ${state}`}</p>
    <button type="button" disabled={disabled} onClick={() => void onRecordingComplete(clip.current, 6)}>Enviar gravação</button>
    <button type="button" onClick={onUseText}>Responder por texto</button>
    {errorMessage ? <p role="alert">{errorMessage}</p> : null}
  </section>;
} }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { role: "teacher" } }) }));
vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }));

const detail = (id = "oral", question = "What's your name?", prompt = "a".repeat(64)) => ({
  id, mode: "speaking", title: `Speaking ${id}`, title_source: "auto", is_pinned: false, status: "active", message_count: 1,
  guided_state: { enabled: true, stage: "active", level: "A1", current_task: question, expected_input: "audio_or_text", speaking: { phase: "SIMULATE" } },
  messages: [{ id: `${id}-question`, role: "assistant", content_type: "text", text: question, metadata: {
    guided: true, expected_input: "audio_or_text", speaking_prompt_id: prompt, speaking_level: "A1", pedagogical_phase: "SIMULATE",
    choices: [{ id: "continue", value: "continue", label: "Continuar", action_type: "simulation_help" }],
    speaking_turn: { feedback: "", instruction: "Responda ao professor.", demonstration: "", demonstration_translation: "",
      question, question_translation: "Qual é seu nome?", response_starter: "My name is...", response_starter_translation: "Meu nome é..." },
  } }],
});

const reply = () => {
  const updated = detail("oral", "Is this your first class?", "b".repeat(64));
  return { data: { session: updated,
    user_message: { id: "recorded", role: "user", content_type: "audio", text: "My name is Gabriel.", audio_url: "/recorded.mp4" },
    assistant_message: { ...updated.messages[0], id: "next-question", metadata: { ...updated.messages[0].metadata,
      assessment_source: "transcript", speaking_turn: { ...updated.messages[0].metadata.speaking_turn, feedback: "Boa resposta, Gabriel!" } } },
  } };
};

const SwitchSession = () => {
  const navigate = useNavigate();
  return <button type="button" onClick={() => navigate(buildSessionPath("other"))}>Abrir outra conversa</button>;
};
const show = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
  <MemoryRouter initialEntries={[buildSessionPath("oral")]}><Routes>
    <Route path={`${APP_PATHS.aiPractice}/conversa/:sessionId`} element={<><AssistenteIA /><SwitchSession /></>} />
  </Routes></MemoryRouter>
</QueryClientProvider>);

describe("Speaking oral composer integration", () => {
  beforeEach(() => {
    vi.spyOn(audio, "recordingSupportError").mockReturnValue("");
    vi.mocked(api.get).mockImplementation(async (url) => {
      if (url === "/ai-study/sessions/") return { data: [detail()] };
      if (url === "/ai-study/context-lessons/") return { data: [] };
      if (url === "/ai-study/sessions/oral/") return { data: detail() };
      if (url === "/ai-study/sessions/other/") return { data: detail("other", "Where are you?", "c".repeat(64)) };
      throw new Error(`Unexpected GET ${url}`);
    });
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); });

  it("sends repetition and chunk targets explicitly, then returns to the pending conversation", async () => {
    const feedback = speakingFeedbackFixture();
    const pending = detail("oral", "Anything else?");
    const initial = { ...pending, messages: [{ ...pending.messages[0], feedback_detail: feedback }] };
    vi.mocked(api.get).mockImplementation(async (url) => {
      if (url === "/ai-study/sessions/") return { data: [initial] };
      if (url === "/ai-study/sessions/oral/") return { data: initial };
      return { data: [] };
    });
    const repeated = { ...feedback, id: "repeated-feedback", transcript: feedback.learning_feedback!.chunks[0], learning_feedback: {
      ...feedback.learning_feedback!, previous_feedback_id: feedback.id, practice_target: feedback.learning_feedback!.chunks[0],
      comparison: "Você usou a expressão do exemplo nesta tentativa.",
    } };
    vi.mocked(api.post).mockResolvedValue({ data: { session: pending,
      user_message: { id: "repeated-recording", role: "user", content_type: "audio", text: repeated.transcript, audio_url: "/retry.mp4" },
      assistant_message: { ...pending.messages[0], id: "repeat-result", feedback_detail: repeated },
    } });
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Praticar por partes" }));
    fireEvent.click(screen.getByRole("button", { name: "Repetir trecho 1" }));
    expect(screen.getByText("Repita o trecho 1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Enviar gravação" }));
    const form = vi.mocked(api.post).mock.calls[0][1] as FormData;
    expect(form.get("retry_feedback_id")).toBe(feedback.id);
    expect(form.get("chunk_index")).toBe("0");
    expect(form.get("feedback_language")).toBe("pt-BR");
    expect(await screen.findByLabelText("Comparação com a tentativa anterior")).toHaveTextContent("Você usou a expressão");
    expect(screen.queryByText("Repita o trecho 1")).not.toBeInTheDocument();
    expect(screen.getAllByText("Anything else?").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Continuar conversa" }));
    fireEvent.click(screen.getByRole("button", { name: "Enviar gravação" }));
    const next = vi.mocked(api.post).mock.calls[1][1] as FormData;
    expect(next.has("retry_feedback_id")).toBe(false);
    expect(next.has("chunk_index")).toBe(false);
    await act(async () => {});
  });

  it("finalizes into a persisted report and offers a new scenario without another recording", async () => {
    const initial = detail();
    initial.messages[0].metadata.choices = [{ id: "finalize", value: "finalize_session", label: "Encerrar", action_type: "session_control" }];
    vi.mocked(api.get).mockImplementation(async (url) => {
      if (url === "/ai-study/sessions/") return { data: [initial] };
      if (url === "/ai-study/sessions/oral/") return { data: initial };
      return { data: [] };
    });
    vi.mocked(api.post).mockResolvedValue({ data: {
      session: { ...initial, status: "completed", guided_state: { ...initial.guided_state, stage: "completed", expected_input: "choice" } },
      assistant_message: { id: "final-report", role: "assistant", content_type: "text", text: "Sessão encerrada.", metadata: {
        guided: true, speaking_report: speakingReportFixture(), expected_input: "choice",
        choices: [{ id: "new-scenario", value: "new_scenario", label: "Novo cenário", action_type: "session_control" }],
      } },
    } });
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Encerrar" }));
    expect(await screen.findByRole("region", { name: "Resumo de Speaking" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Novo cenário" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Gravador conectado" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Sua resposta por texto" })).not.toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith("/ai-study/sessions/oral/message/", expect.objectContaining({
      guided_action: expect.objectContaining({ value: "finalize_session" }),
    }));
  });

  it("prioritizes the microphone and exposes a focused text alternative", async () => {
    show();
    await screen.findByRole("region", { name: "Gravador conectado" });
    expect(screen.queryByRole("textbox", { name: "Sua resposta por texto" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Responder por texto" }));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Sua resposta por texto" })).toHaveFocus());
    fireEvent.click(screen.getByRole("button", { name: "Usar microfone" }));
    expect(screen.getByRole("region", { name: "Gravador conectado" })).toBeInTheDocument();
  });

  it("keeps text available automatically when recording is unsupported", async () => {
    vi.mocked(audio.recordingSupportError).mockReturnValue("Gravação indisponível");
    show();
    expect(await screen.findByRole("textbox", { name: "Sua resposta por texto" })).toBeEnabled();
  });

  it("sends the actual file format and announces server processing after upload", async () => {
    let resolve!: (value: ReturnType<typeof reply>) => void;
    vi.mocked(api.post).mockReturnValue(new Promise((done) => { resolve = done; }));
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Enviar gravação" }));
    expect(screen.getByText("Gravador: uploading")).toBeInTheDocument();
    const [url, formData, config] = vi.mocked(api.post).mock.calls[0];
    expect(url).toBe("/ai-study/sessions/oral/audio/");
    const form = formData as FormData;
    expect((form.get("audio") as File).name).toMatch(/\.m4a$/);
    expect((form.get("audio") as File).type).toBe("audio/mp4");
    expect(form.get("duration_seconds")).toBe("6");
    expect(form.get("prompt_id")).toBe("a".repeat(64));
    act(() => config?.onUploadProgress?.({ loaded: 10, total: 10, bytes: 10, lengthComputable: true, upload: true }));
    expect(screen.getByText("Gravador: processing")).toBeInTheDocument();
    await act(async () => { resolve(reply()); });
    expect(await screen.findByText("Is this your first class?")).toBeInTheDocument();
    expect(screen.getByText(/Pronúncia não avaliada/)).toBeInTheDocument();
  });

  it("preserves the prompt after transcription failure and reuses the request key on retry", async () => {
    vi.mocked(api.post).mockRejectedValueOnce({ isAxiosError: true, response: { data: { detail: "Não consegui entender o áudio. Você pode responder por texto." } } }).mockResolvedValueOnce(reply());
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Enviar gravação" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Não consegui entender o áudio");
    expect(screen.getByText("What's your name?")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Enviar gravação" })).toBeEnabled());
    const first = vi.mocked(api.post).mock.calls[0][1] as FormData;
    fireEvent.click(screen.getByRole("button", { name: "Enviar gravação" }));
    await screen.findByText("Is this your first class?");
    const second = vi.mocked(api.post).mock.calls[1][1] as FormData;
    expect(second.get("request_id")).toBe(first.get("request_id"));
  });

  it("does not append a late audio response to a different open session", async () => {
    let resolve!: (value: ReturnType<typeof reply>) => void;
    vi.mocked(api.post).mockReturnValue(new Promise((done) => { resolve = done; }));
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Enviar gravação" }));
    fireEvent.click(screen.getByRole("button", { name: "Abrir outra conversa" }));
    await screen.findByText("Where are you?");
    await act(async () => { resolve(reply()); });
    expect(screen.getByText("Where are you?")).toBeInTheDocument();
    expect(screen.queryByText("Is this your first class?")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enviar gravação" })).toBeEnabled();
  });
});
