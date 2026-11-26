import { useCallback } from "react";
import { ChevronDown } from "lucide-react";
import { Badge, StudyBlock } from "@/components/student/ui";
import VocabularyAudioButton from "@/components/VocabularyAudioButton";
import { api } from "@/lib/api";
import type { SpeakingHelp, SpeakingPhase, SpeakingTurnContent } from "@/lib/aiStudy";

const summaryClass = "flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-md text-body font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-details-marker]:hidden";

export const SpeakingUtteranceAudio = ({ sessionId, messageId, part, text, label }: {
  sessionId: string; messageId: string; part: "question" | "demonstration" | "model_answer"; text: string; label: string;
}) => {
  const requestAudio = useCallback(async () => {
    const response = await api.post(`/ai-study/sessions/${sessionId}/utterance-audio/`, { message_id: messageId, part });
    return response.data.audio_url as string;
  }, [sessionId, messageId, part]);
  return <VocabularyAudioButton text={text} label={label} requestAudio={requestAudio} className="min-h-11" />;
};

export const SpeakingHelpCard = ({ help }: { help: SpeakingHelp }) => {
  const labels: Record<string, string> = { not_understood: "Entendendo a fala", hint: "Dica para responder", translate: "Tradução", examples: "Respostas possíveis", grammar: "Gramática na conversa", request: "Vamos juntos" };
  return (
    <section aria-label="Ajuda contextual" data-speaking-focus>
      <StudyBlock kind="tip" title={labels[help.action] || "Ajuda"}>
        {help.examples.length ? (
          <ul className="divide-y divide-ai-accent/30">
            {help.examples.map((example, index) => (
              <li key={index} className="py-2 first:pt-1 last:pb-0">
                <p lang="en" className="break-words font-medium">{example.text}</p>
                <p className="text-body text-ink" lang="pt-BR">{example.translation}</p>
              </li>
            ))}
          </ul>
        ) : <p className="whitespace-pre-line break-words">{help.text}</p>}
      </StudyBlock>
    </section>
  );
};

const SpeakingTurnCard = ({ content, phase, level, sessionId, messageId, assessmentSource }: {
  content: SpeakingTurnContent; phase?: SpeakingPhase; level?: string;
  sessionId: string; messageId: string; assessmentSource?: "text" | "transcript" | null;
}) => (
  <div className="min-w-0 space-y-4 break-words">
    {content.feedback ? (
      <section aria-label="Feedback da resposta">
        <StudyBlock kind="tip" title={phase === "FEEDBACK" ? "Fechamento" : "Sobre sua resposta"}>
          <p className="whitespace-pre-line">{content.feedback}</p>
          {assessmentSource ? <p className="mt-2 text-caption text-ink">
            {assessmentSource === "transcript" ? "Conteúdo avaliado a partir da transcrição. Pronúncia não avaliada." : "Feedback sobre sua resposta escrita."}
          </p> : null}
        </StudyBlock>
      </section>
    ) : null}
    {content.instruction ? <section aria-label="Orientação do professor" className="space-y-2">
      <Badge>Orientação</Badge>
      <p className="whitespace-pre-line text-body-lg text-ink">{content.instruction}</p>
    </section> : null}
    {content.demonstration ? <section aria-label="Exemplo do professor">
      <StudyBlock kind="example" title="Veja como falar">
        <p lang="en" className="font-medium">{content.demonstration}</p>
        {content.demonstration_translation && ["A1", "A2"].includes(level || "") ? <p className="mt-1 text-body text-ink" lang="pt-BR">{content.demonstration_translation}</p> : null}
        <div className="mt-3"><SpeakingUtteranceAudio sessionId={sessionId} messageId={messageId} part="demonstration" text={content.demonstration} label="Ouvir exemplo" /></div>
      </StudyBlock>
    </section> : null}
    {content.question ? <section aria-label="Pergunta da atividade" data-speaking-focus className="space-y-3 rounded-lg border border-primary-light p-4">
      <Badge tone="primary">{phase === "SIMULATE" ? "Na conversa" : "Agora é sua vez"}</Badge>
      <p lang="en" className="break-words text-h4 text-ink">{content.question}</p>
      <SpeakingUtteranceAudio sessionId={sessionId} messageId={messageId} part="question" text={content.question} label="Ouvir pergunta" />
      {content.question_translation ? <details className="group/translation">
        <summary className={summaryClass}>Ver tradução da pergunta
          <ChevronDown size={16} aria-hidden="true" className="shrink-0 transition-transform duration-200 ease-standard group-open/translation:rotate-180" />
        </summary>
        <p lang="pt-BR" className="mt-1 rounded-lg bg-surface-muted px-4 py-3 text-body-lg text-ink">{content.question_translation}</p>
      </details> : null}
    </section> : null}
    {content.response_starter ? <section aria-label="Apoio para responder">
      <StudyBlock kind="example" title="Você pode começar assim">
        <p lang="en">{content.response_starter}</p>
        {content.response_starter_translation && ["A1", "A2"].includes(level || "") ? <p lang="pt-BR" className="mt-1 text-body text-ink">{content.response_starter_translation}</p> : null}
      </StudyBlock>
    </section> : null}
  </div>
);

export default SpeakingTurnCard;
