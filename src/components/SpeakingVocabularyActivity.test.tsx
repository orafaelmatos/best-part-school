import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SpeakingVocabularyActivity from "@/components/SpeakingVocabularyActivity";
import VocabularyAudioButton from "@/components/VocabularyAudioButton";
import type { SpeakingVocabularyActivity as Activity } from "@/lib/aiStudy";
import { api } from "@/lib/api";

vi.mock("@/lib/api", () => ({ api: { post: vi.fn() } }));

const activity: Activity = {
  step: "WORD", item_index: 0, total_items: 2, completed_count: 0, review_count: 0,
  item: { expression: "Mat", translation: "Tatame", example: "I'm on the mat.", example_translation: "Estou no tatame." },
  feedback: "", hint: "", task: null, next: "", assessment_source: null,
  attempts: 0, max_attempts: 3, show_translations: true,
};

const show = (value = activity, onRecord = vi.fn()) => render(
  <SpeakingVocabularyActivity activity={value} sessionId="session-1" messageId="message-1"
    instruction="" interactive onRecord={onRecord} />,
);

describe("Speaking vocabulary microactivities", () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("preserves the existing vocabulary-card audio request contract", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { audio_url: "/media/card.mp3" } });
    render(<VocabularyAudioButton cardId="card-1" text="Mat" />);
    fireEvent.click(screen.getByRole("button", { name: "Ouvir pronúncia" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/vocabulary-cards/card-1/audio/", {}));
  });

  it("shows one translated expression before progressively revealing its example", () => {
    show();
    expect(screen.getByText("Mat")).toBeInTheDocument();
    expect(screen.getByText("Tatame")).toBeInTheDocument();
    expect(screen.queryByText("I'm on the mat.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ouvir palavra ou expressão" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ouvir frase" })).not.toBeInTheDocument();
  });

  it("requests the saved word and sentence audio independently", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { audio_url: "/media/word.mp3" } });
    const view = show();
    fireEvent.click(screen.getByRole("button", { name: "Ouvir palavra ou expressão" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      "/ai-study/sessions/session-1/vocabulary-audio/", { message_id: "message-1", part: "word" },
    ));
    view.rerender(<SpeakingVocabularyActivity activity={{ ...activity, step: "EXAMPLE" }}
      sessionId="session-1" messageId="message-2" instruction="" />);
    expect(screen.getByText("I'm on the mat.")).toBeInTheDocument();
    expect(screen.getByText("Estou no tatame.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ouvir frase" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      "/ai-study/sessions/session-1/vocabulary-audio/", { message_id: "message-2", part: "example" },
    ));
  });

  it("opens the existing microphone and offers a text alternative", () => {
    const record = vi.fn();
    show({ ...activity, step: "REPEAT" }, record);
    fireEvent.click(screen.getByRole("button", { name: "Repetir pelo microfone" }));
    expect(record).toHaveBeenCalledOnce();
    expect(screen.getByText(/responda pelo campo de texto/i)).toBeInTheDocument();
  });

  it("shows a demonstrated answer and its translation for guided practice", () => {
    show({ ...activity, step: "GUIDED", task: {
      instruction: "Vamos responder juntos.", question: "Where are you?", question_translation: "Onde você está?",
      model_answer: "I'm on the mat.", model_answer_translation: "Estou no tatame.", hint: "Use on the mat.",
    } });
    expect(screen.getByText("Você pode responder assim:")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Responder pelo microfone" })).toBeInTheDocument();
  });

  it("lets advanced learners reveal vocabulary translations without sending a turn", () => {
    show({ ...activity, show_translations: false });
    expect(screen.queryByText("Tatame")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ver traduções do vocabulário" }));
    expect(screen.getByText("Tatame")).toBeInTheDocument();
  });

  it("keeps text and microphone available if TTS generation fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(api.post).mockRejectedValue(new Error("unavailable"));
    show({ ...activity, step: "REPEAT" });
    fireEvent.click(screen.getByRole("button", { name: "Ouvir frase" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("exemplo escrito");
    expect(screen.getByRole("button", { name: "Repetir pelo microfone" })).toBeEnabled();
    expect(screen.getByText("I'm on the mat.")).toBeInTheDocument();
  });

  it("offers the written alternative after an audio playback error", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { audio_url: "/media/word.mp3" } });
    const { container } = show();
    fireEvent.click(screen.getByRole("button", { name: "Ouvir palavra ou expressão" }));
    await waitFor(() => expect(container.querySelector("audio")).not.toBeNull());
    fireEvent.error(container.querySelector("audio")!);
    expect(screen.getByRole("alert")).toHaveTextContent("Continue pelo texto");
  });

  it("identifies transcript feedback and does not offer a new attempt in an old message", () => {
    render(<SpeakingVocabularyActivity activity={{ ...activity, step: "FEEDBACK", assessment_source: "transcript" }}
      sessionId="session-1" messageId="message-1" instruction="Boa resposta!" interactive={false} />);
    expect(screen.getByText("Feedback sobre a resposta transcrita.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Repetir pelo microfone" })).not.toBeInTheDocument();
  });
});
