import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SpeakingTurnCard, { SpeakingHelpCard } from "@/components/SpeakingTurnCard";
import SpeakingSessionOverview from "@/components/SpeakingSessionOverview";
import type { GuidedState, SpeakingTurnContent } from "@/lib/aiStudy";
import { api } from "@/lib/api";

vi.mock("@/lib/api", () => ({ api: { post: vi.fn() } }));
const content: SpeakingTurnContent = {
  feedback: 'Boa! Sua resposta combina com a situação.', instruction: 'Agora diga seu nome ao professor.',
  demonstration: 'My name is Ana.', demonstration_translation: 'Meu nome é Ana.',
  question: "What's your name?", question_translation: 'Qual é seu nome?',
  response_starter: 'My name is...', response_starter_translation: 'Meu nome é...',
};
afterEach(() => vi.clearAllMocks());

describe("Speaking step presentation", () => {
  it("separates guidance, examples, dialogue, support and contextual feedback", () => {
    render(<SpeakingTurnCard content={content} phase="SIMULATE" level="A1" sessionId="session-1" messageId="message-1" assessmentSource="transcript" />);
    for (const label of ['Feedback da resposta', 'Orientação do professor', 'Exemplo do professor', 'Pergunta da atividade', 'Apoio para responder']) {
      expect(screen.getByRole('region', { name: label })).toBeInTheDocument();
    }
    expect(screen.getByText("What's your name?")).toHaveAttribute('lang', 'en');
    expect(screen.getByText('Meu nome é Ana.')).toBeInTheDocument();
    expect(screen.getByText(/Pronúncia não avaliada/)).toBeInTheDocument();
    const translation = screen.getByText('Qual é seu nome?').closest('details');
    expect(translation).not.toHaveAttribute('open');
    fireEvent.click(screen.getByText('Ver tradução da pergunta'));
    expect(translation).toHaveAttribute('open');
  });

  it("requests only a stored English utterance and keeps text visible on TTS failure", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(api.post).mockRejectedValue(new Error('tts unavailable'));
    render(<SpeakingTurnCard content={{ ...content, demonstration: '', response_starter: '' }} phase="SIMULATE" level="A1" sessionId="session-1" messageId="message-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Ouvir pergunta' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/ai-study/sessions/session-1/utterance-audio/', { message_id: 'message-1', part: 'question' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('exemplo escrito');
    expect(screen.getByText("What's your name?")).toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it("shows possible answers as translated examples without submitting a learner response", () => {
    render(<SpeakingHelpCard help={{ action: 'examples', text: 'examples', examples: [
      { text: 'Yes, please.', translation: 'Sim, por favor.' }, { text: 'No, thanks.', translation: 'Não, obrigado.' },
    ] }} />);
    expect(screen.getByText('Respostas possíveis')).toBeInTheDocument();
    expect(screen.getByText('Sim, por favor.')).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("identifies the current phase using the existing design tokens without inventing progress", () => {
    const state = { stage: 'active', level: 'A1', speaking: { phase: 'PRACTICE' } } as GuidedState;
    render(<SpeakingSessionOverview state={state} />);
    const steps = screen.getByRole('navigation', { name: 'Etapas da prática' });
    expect(steps.querySelector('[aria-current="step"]')).toHaveTextContent('Praticar');
    expect(screen.getByText('4. Feedback')).toBeInTheDocument();
  });
});
