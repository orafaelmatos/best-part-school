import { useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import VocabularyAudioButton from "@/components/VocabularyAudioButton";
import { api } from "@/lib/api";
import type { SpeakingHelp, SpeakingPhase, SpeakingTurnContent } from "@/lib/aiStudy";

export const SpeakingUtteranceAudio = ({ sessionId, messageId, part, text, label }: {
  sessionId: string; messageId: string; part: "question" | "demonstration" | "model_answer"; text: string; label: string;
}) => {
  const requestAudio = useCallback(async () => {
    const response = await api.post(`/ai-study/sessions/${sessionId}/utterance-audio/`, { message_id: messageId, part });
    return response.data.audio_url as string;
  }, [sessionId, messageId, part]);
  return <VocabularyAudioButton text={text} label={label} requestAudio={requestAudio} />;
};

export const SpeakingHelpCard = ({ help }: { help: SpeakingHelp }) => {
  const labels: Record<string, string> = { not_understood: "Entendendo a fala", hint: "Dica para responder", translate: "Tradução", examples: "Respostas possíveis", grammar: "Gramática na conversa", request: "Vamos juntos" };
  return (
    <section aria-label="Ajuda contextual" data-speaking-focus className="space-y-3 rounded-2xl border border-border bg-muted/40 p-4">
      <Badge variant="secondary">{labels[help.action] || "Ajuda"}</Badge>
      {help.examples.length ? help.examples.map((example, index) => (
        <div key={index} className="rounded-xl border border-border bg-card p-3">
          <p lang="en">{example.text}</p><p className="text-sm text-muted-foreground" lang="pt-BR">{example.translation}</p>
        </div>
      )) : <p className="whitespace-pre-line">{help.text}</p>}
    </section>
  );
};

const SpeakingTurnCard = ({ content, phase, level, sessionId, messageId, assessmentSource }: {
  content: SpeakingTurnContent; phase?: SpeakingPhase; level?: string;
  sessionId: string; messageId: string; assessmentSource?: "text" | "transcript" | null;
}) => (
  <div className="space-y-4">
    {content.feedback ? (
      <section aria-label="Feedback da resposta" className="rounded-2xl border border-primary/15 bg-primary/5 p-3">
        <p className="text-xs font-semibold text-primary">{phase === "FEEDBACK" ? "Fechamento" : "Sobre sua resposta"}</p>
        <p className="mt-1 whitespace-pre-line text-sm">{content.feedback}</p>
        {assessmentSource ? <p className="mt-2 text-xs text-muted-foreground">
          {assessmentSource === "transcript" ? "Conteúdo avaliado a partir da transcrição. Pronúncia não avaliada." : "Feedback sobre sua resposta escrita."}
        </p> : null}
      </section>
    ) : null}
    {content.instruction ? <section aria-label="Orientação do professor" className="space-y-1">
      <Badge variant="secondary">Orientação</Badge><p className="whitespace-pre-line text-sm text-muted-foreground">{content.instruction}</p>
    </section> : null}
    {content.demonstration ? <section aria-label="Exemplo do professor" className="space-y-2 rounded-2xl bg-muted/50 p-4">
      <p className="text-xs font-semibold text-muted-foreground">Veja como falar</p>
      <p lang="en" className="font-medium">{content.demonstration}</p>
      {content.demonstration_translation && ["A1", "A2"].includes(level || "") ? <p className="text-sm text-muted-foreground" lang="pt-BR">{content.demonstration_translation}</p> : null}
      <SpeakingUtteranceAudio sessionId={sessionId} messageId={messageId} part="demonstration" text={content.demonstration} label="Ouvir exemplo" />
    </section> : null}
    {content.question ? <section aria-label="Pergunta da atividade" data-speaking-focus className="space-y-3 rounded-2xl border border-primary/25 bg-card p-4">
      <Badge variant="outline">{phase === "SIMULATE" ? "Na conversa" : "Agora é sua vez"}</Badge>
      <p lang="en" className="break-words text-lg font-semibold leading-relaxed">{content.question}</p>
      <SpeakingUtteranceAudio sessionId={sessionId} messageId={messageId} part="question" text={content.question} label="Ouvir pergunta" />
      {content.question_translation ? <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">Ver tradução da pergunta</summary>
        <p lang="pt-BR" className="mt-2 rounded-xl bg-muted/50 p-3">{content.question_translation}</p>
      </details> : null}
    </section> : null}
    {content.response_starter ? <section aria-label="Apoio para responder" className="space-y-1 rounded-xl border border-dashed border-border p-3">
      <p className="text-xs font-medium text-muted-foreground">Você pode começar assim</p>
      <p lang="en">{content.response_starter}</p>
      {content.response_starter_translation && ["A1", "A2"].includes(level || "") ? <p lang="pt-BR" className="text-sm text-muted-foreground">{content.response_starter_translation}</p> : null}
    </section> : null}
  </div>
);

export default SpeakingTurnCard;
