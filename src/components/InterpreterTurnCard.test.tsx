import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import InterpreterTurnCard from "./InterpreterTurnCard";
import { interpreterFeedback, interpreterState, interpreterTurn } from "@/test/interpreter";
import type { InterpreterState } from "@/lib/interpreter";

vi.mock("@/components/InterpreterAudio", () => ({ default: ({ label, onEnded }: { label: string; onEnded?: () => void }) => <button onClick={onEnded}>{label}</button> }));
vi.mock("@/components/MicRecorder", () => ({ default: ({ disabled, onRecordingComplete, recordLabel }: { disabled?: boolean; onRecordingComplete: (blob: Blob, seconds: number) => void; recordLabel: string }) => <button disabled={disabled} onClick={() => onRecordingComplete(new Blob(["recording"], { type: "audio/webm" }), 8)}>{recordLabel}</button> }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const show = (state: InterpreterState = interpreterState, extra = {}) => {
  const onAnswer = vi.fn().mockResolvedValue(undefined);
  render(<InterpreterTurnCard sessionId="session-v2" message={interpreterTurn} state={state} busy={false} onAnswer={onAnswer} onRetry={vi.fn()} {...extra} />);
  return { onAnswer };
};
describe("InterpreterTurnCard", () => {
  it("defaults to voice and waits for the source before recording", () => {
    show();
    expect(screen.getByRole("button", { name: "Interpretar por voz" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Gravar interpretação" })).toBeDisabled();
    expect(screen.getByText("Sua vez! Interprete para o português.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ouvir fala original" }));
    expect(screen.getByRole("button", { name: "Gravar interpretação" })).not.toBeDisabled();
    expect(screen.getByText("Dica: Preserve a ideia de gratidão.")).toBeInTheDocument();
  });
  it("lets the learner preview a recording and sends the actual audio only after confirmation", async () => {
    const create = vi.fn(() => "blob:interpretacao");
    const revoke = vi.fn();
    vi.stubGlobal("URL", class extends URL { static createObjectURL = create; static revokeObjectURL = revoke; });
    const { onAnswer } = show();
    fireEvent.click(screen.getByRole("button", { name: "Ouvir fala original" }));
    fireEvent.click(screen.getByRole("button", { name: "Gravar interpretação" }));
    expect(await screen.findByLabelText("Ouvir minha interpretação")).toHaveAttribute("src", "blob:interpretacao");
    expect(onAnswer).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Enviar interpretação" }));
    await waitFor(() => expect(onAnswer).toHaveBeenCalledTimes(1));
    const body = onAnswer.mock.calls[0][0] as FormData;
    expect(body.get("audio")).toBeInstanceOf(Blob);
    expect(body.get("response_mode")).toBe("voice");
    expect(body.get("message_id")).toBe("turn-1");
    expect(body.get("duration_seconds")).toBe("8");
  });
  it("submits interpretation text in the destination language without advancing", async () => {
    const { onAnswer } = show();
    fireEvent.click(screen.getByRole("button", { name: "Ouvir fala original" }));
    fireEvent.click(screen.getByRole("button", { name: "Escrever sozinho" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Sua interpretação em português" }), { target: { value: "Que bênção estar com vocês esta noite!" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar interpretação" }));
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith(expect.objectContaining({ response_mode: "text", answer_text: "Que bênção estar com vocês esta noite!", request_id: expect.any(String) })));
  });
  it("hides assistance in realistic mode until after an answer", () => {
    show({ ...interpreterState, settings: { ...interpreterState.settings, realistic: true } });
    expect(screen.queryByRole("button", { name: "Ver transcrição original" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Dica:/)).not.toBeInTheDocument();
    expect(screen.queryByText(interpreterTurn.text)).not.toBeInTheDocument();
  });
  it("shows Portuguese feedback and plays the suggestion in the correct language", () => {
    show(interpreterState, { feedback: interpreterFeedback, answer: { id: "answer-1", role: "user", text: "Que bênção estar com vocês esta noite!", audio_url: "/media/answer.webm" } });
    expect(screen.getByText(interpreterFeedback.summary)).toBeInTheDocument();
    expect(screen.getByLabelText("Ouvir minha interpretação enviada")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ouvir interpretação sugerida em português" })).toBeInTheDocument();
    fireEvent.click(screen.getByText("Ver detalhes da avaliação"));
    expect(screen.getByText(/Fluidez, pronúncia e clareza da fala não avaliadas/)).toBeInTheDocument();
  });
  it("does not announce stage names in free interpretation", () => {
    show({ ...interpreterState, settings: { ...interpreterState.settings, session_style: "free" } });
    expect(screen.queryByText("Saudação à igreja")).not.toBeInTheDocument();
    expect(screen.getByText("Christopher")).toBeInTheDocument();
  });
});
