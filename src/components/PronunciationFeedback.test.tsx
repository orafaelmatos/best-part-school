import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PronunciationFeedback from "@/components/PronunciationFeedback";
import { api } from "@/lib/api";
import { speakingFeedbackFixture } from "@/test/speakingFeedback";

vi.mock("@/components/AudioPlayer", () => ({ default: ({ src }: { src: string }) => <audio aria-label="Áudio original" src={src} /> }));
vi.mock("@/lib/api", () => ({ api: { post: vi.fn() } }));

describe("Short Speaking feedback", () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); });

  it("separates the original recording from the exact saved suggestion and allows replay at 0.75x", async () => {
    const feedback = speakingFeedbackFixture();
    vi.mocked(api.post).mockResolvedValue({ data: { audio_url: "/suggestion.mp3", text: feedback.learning_feedback!.suggested_sentence } });
    render(<PronunciationFeedback feedback={feedback} />);
    const original = screen.getByLabelText("Áudio original") as HTMLAudioElement;
    expect(original.getAttribute("src")).toContain("/student-original.webm");
    expect(screen.queryByLabelText(/^Áudio sugerido:/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ouvir pronúncia" }));
    const suggested = await screen.findByLabelText(`Áudio sugerido: ${feedback.natural_sentence}`) as HTMLAudioElement;
    expect(suggested.getAttribute("src")).toContain("/suggestion.mp3");
    expect(original.getAttribute("src")).toContain("/student-original.webm");
    expect(suggested).not.toBe(original);
    fireEvent.change(screen.getByRole("combobox", { name: "Velocidade da pronúncia sugerida" }), { target: { value: "0.75" } });
    expect(suggested.playbackRate).toBe(0.75);
    fireEvent.click(screen.getByRole("button", { name: "Ouvir novamente" }));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it("rejects audio bound to a different sentence and can retry after TTS failure", async () => {
    const feedback = speakingFeedbackFixture();
    vi.mocked(api.post).mockRejectedValueOnce(new Error("unavailable")).mockResolvedValueOnce({ data: { audio_url: "/wrong.mp3", text: feedback.corrected_sentence } });
    render(<PronunciationFeedback feedback={feedback} />);
    fireEvent.click(screen.getByRole("button", { name: "Ouvir pronúncia" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Tente novamente");
    fireEvent.click(screen.getByRole("button", { name: "Ouvir pronúncia" }));
    await act(async () => {});
    expect(screen.queryByLabelText(/^Áudio sugerido:/)).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("keeps feedback short, translations available and grammar distinct from optional naturalness", () => {
    render(<PronunciationFeedback feedback={speakingFeedbackFixture()} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    const details = screen.getByText("Ver mais detalhes").closest("details")!;
    expect(details.open).toBe(false);
    fireEvent.click(screen.getByText("Ver tradução"));
    expect(screen.getByText("Eu gostaria de um café com leite, mas sem açúcar, por favor.")).toBeVisible();
    details.open = true;
    expect(screen.getByText("Gramática · Correta")).toBeVisible();
    expect(screen.getByText("Naturalidade · Alternativa opcional")).toBeVisible();
    expect(screen.getByText("Pronúncia · Não avaliada")).toBeVisible();
    expect(screen.queryByText(/\d+\/100/)).not.toBeInTheDocument();
  });

  it("offers individual chunk audio and repetition followed by the full phrase", async () => {
    const feedback = speakingFeedbackFixture();
    const repeat = vi.fn();
    const next = vi.fn();
    vi.mocked(api.post).mockResolvedValue({ data: { audio_url: "/part.mp3", text: feedback.learning_feedback!.chunks[0] } });
    render(<PronunciationFeedback feedback={feedback} onRepeat={repeat} onNextSituation={next} />);
    fireEvent.click(screen.getByRole("button", { name: "Praticar por partes" }));
    const first = screen.getByText("Etapa 1").closest("section")!;
    fireEvent.click(within(first).getByRole("button", { name: "Ouvir pronúncia" }));
    await screen.findByLabelText(`Áudio sugerido: ${feedback.learning_feedback!.chunks[0]}`);
    expect(api.post).toHaveBeenCalledWith("/ai-study/feedback/oral-feedback/tts/", { chunk_index: 0, full_sentence: false }, expect.anything());
    fireEvent.click(screen.getByRole("button", { name: "Repetir trecho 1" }));
    expect(repeat).toHaveBeenLastCalledWith(feedback, 0);
    fireEvent.click(screen.getByRole("button", { name: "Tentar frase completa" }));
    expect(repeat).toHaveBeenLastCalledWith(feedback);
    fireEvent.click(screen.getByRole("button", { name: "Próxima situação" }));
    expect(next).toHaveBeenCalledOnce();
  });

  it("asks for clarification without offering an invented sentence or a pronunciation drill", () => {
    const feedback = speakingFeedbackFixture();
    feedback.learning_feedback = { ...feedback.learning_feedback!, suggested_sentence: "", needs_clarification: true,
      clarification_question: "Você quer o café com ou sem leite?", changes: [] };
    render(<PronunciationFeedback feedback={feedback} onRepeat={vi.fn()} />);
    expect(screen.getByText("Você quer o café com ou sem leite?")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tentar pronunciar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ouvir pronúncia" })).not.toBeInTheDocument();
  });
});
