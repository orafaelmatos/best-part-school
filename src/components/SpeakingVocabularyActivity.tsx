import { useCallback, useState } from "react";
import { ChevronDown, Mic } from "lucide-react";
import { Button, ProgressBar, StudyBlock } from "@/components/student/ui";
import VocabularyAudioButton from "@/components/VocabularyAudioButton";
import { api } from "@/lib/api";
import type { SpeakingVocabularyActivity as Activity } from "@/lib/aiStudy";
import { SpeakingUtteranceAudio } from "@/components/SpeakingTurnCard";

type Props = {
  activity: Activity;
  sessionId: string;
  messageId: string;
  instruction: string;
  interactive?: boolean;
  disabled?: boolean;
  onRecord?: () => void;
};

const SpeakingVocabularyActivity = ({ activity, sessionId, messageId, instruction, interactive, disabled, onRecord }: Props) => {
  const [showTranslations, setShowTranslations] = useState(activity.show_translations);
  const wordAudio = useCallback(async () => {
    const response = await api.post(`/ai-study/sessions/${sessionId}/vocabulary-audio/`, { message_id: messageId, part: "word" });
    return response.data.audio_url as string;
  }, [sessionId, messageId]);
  const exampleAudio = useCallback(async () => {
    const response = await api.post(`/ai-study/sessions/${sessionId}/vocabulary-audio/`, { message_id: messageId, part: "example" });
    return response.data.audio_url as string;
  }, [sessionId, messageId]);
  const showExample = activity.step !== "WORD";
  const awaitingAnswer = activity.step === "REPEAT" || activity.step === "GUIDED";
  const isSimpleItemText = instruction === `${activity.item.expression} — ${activity.item.translation}` ||
    instruction === `${activity.item.example} — ${activity.item.example_translation}`;

  return (
    <section aria-label="Atividade de vocabulário" data-speaking-focus={activity.step === "FEEDBACK" ? true : undefined} className="min-w-0 space-y-4 break-words">
      {instruction && !isSimpleItemText && activity.step !== "GUIDED" ? (
        activity.step === "FEEDBACK"
          ? <StudyBlock kind="tip" title="Sobre sua resposta"><p className="whitespace-pre-line">{instruction}</p></StudyBlock>
          : <p className="whitespace-pre-line text-body-lg text-ink">{instruction}</p>
      ) : null}
      {activity.step === "GUIDED" && activity.task ? <section aria-label="Pergunta da prática guiada" data-speaking-focus className="space-y-3">
        <p className="text-body-lg text-ink">{activity.task.instruction}</p>
        <p lang="en" className="text-h4 text-ink">{activity.task.question}</p>
        <SpeakingUtteranceAudio sessionId={sessionId} messageId={messageId} part="question" text={activity.task.question} label="Ouvir pergunta guiada" />
        <details className="group/question">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-md text-body font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-details-marker]:hidden">Ver tradução da pergunta
            <ChevronDown size={16} aria-hidden="true" className="shrink-0 transition-transform duration-200 ease-standard group-open/question:rotate-180" />
          </summary>
          <p lang="pt-BR" className="mt-1 rounded-lg bg-surface-muted px-4 py-3 text-body-lg text-ink">{activity.task.question_translation}</p>
        </details>
      </section> : null}
      <div className="space-y-2">
        <p className="text-caption text-ink-secondary">
          Expressão {activity.item_index + 1} de {activity.total_items}
        </p>
        <ProgressBar value={activity.item_index + 1} max={activity.total_items} label={`Expressão ${activity.item_index + 1} de ${activity.total_items}`} />
      </div>
      <div data-speaking-focus={["WORD", "EXAMPLE"].includes(activity.step) ? true : undefined} className="space-y-3 rounded-lg bg-surface-muted p-4">
        <div>
          <p lang="en" className="text-h4 text-ink">{activity.item.expression}</p>
          {showTranslations ? <p className="text-body text-ink">{activity.item.translation}</p> : null}
        </div>
        <VocabularyAudioButton text={activity.item.expression} label="Ouvir palavra ou expressão" requestAudio={wordAudio} className="min-h-11" />
        {showExample ? (
          <div data-speaking-focus={activity.step === "REPEAT" ? true : undefined} className="space-y-2 border-t border-line pt-3">
            <p lang="en" className="text-body-lg text-ink">{activity.item.example}</p>
            {showTranslations ? <p className="text-body text-ink">{activity.item.example_translation}</p> : null}
            <VocabularyAudioButton text={activity.item.example} label="Ouvir frase" requestAudio={exampleAudio} className="min-h-11" />
          </div>
        ) : null}
      </div>
      {activity.task ? (
        <StudyBlock kind="example" title="Você pode responder assim:">
          <p lang="en">{activity.task.model_answer}</p>
          {showTranslations ? <p className="mt-1 text-body text-ink">{activity.task.model_answer_translation}</p> : null}
          <div className="mt-3">
            <SpeakingUtteranceAudio sessionId={sessionId} messageId={messageId} part="model_answer" text={activity.task.model_answer} label="Ouvir resposta modelo" />
          </div>
        </StudyBlock>
      ) : null}
      {!activity.show_translations ? (
        <Button type="button" variant="ghost" size="sm" className="-ml-2" onClick={() => setShowTranslations((current) => !current)}>
          {showTranslations ? "Ocultar traduções" : "Ver traduções do vocabulário"}
        </Button>
      ) : null}
      {activity.hint ? <StudyBlock kind="tip" title="Dica"><p className="whitespace-pre-line">{activity.hint}</p></StudyBlock> : null}
      {activity.feedback && activity.step !== "FEEDBACK" ? <p className="text-body-lg text-ink">{activity.feedback}</p> : null}
      {activity.step === "FEEDBACK" && activity.assessment_source ? (
        <p className="text-caption text-ink-secondary">
          {activity.assessment_source === "transcript" ? "Feedback sobre a resposta transcrita." : "Feedback sobre sua resposta escrita."}
        </p>
      ) : null}
      {interactive && awaitingAnswer ? (
        <div className="space-y-2">
          <Button type="button" disabled={disabled} onClick={onRecord}>
            <Mic aria-hidden="true" />
            {activity.step === "REPEAT" ? "Repetir pelo microfone" : "Responder pelo microfone"}
          </Button>
          <p className="text-caption text-ink-secondary">Se o microfone estiver indisponível, responda pelo campo de texto.</p>
        </div>
      ) : null}
      {activity.review_count ? <p className="text-caption text-ink-secondary">Expressões para revisar: {activity.review_count}.</p> : null}
    </section>
  );
};

export default SpeakingVocabularyActivity;
