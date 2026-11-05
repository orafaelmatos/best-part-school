import { useCallback, useState } from "react";
import { Mic } from "lucide-react";
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
    <section aria-label="Atividade de vocabulário" data-speaking-focus={activity.step === "FEEDBACK" ? true : undefined} className="space-y-3">
      {instruction && !isSimpleItemText && activity.step !== "GUIDED" ? (
        <div className={activity.step === "FEEDBACK" ? "rounded-xl border border-primary/15 bg-primary/5 p-3" : ""}>
          {activity.step === "FEEDBACK" ? <p className="mb-1 text-xs font-semibold text-primary">Sobre sua resposta</p> : null}
          <p className="whitespace-pre-line">{instruction}</p>
        </div>
      ) : null}
      {activity.step === "GUIDED" && activity.task ? <section aria-label="Pergunta da prática guiada" data-speaking-focus className="space-y-3">
        <p className="text-sm text-muted-foreground">{activity.task.instruction}</p>
        <p lang="en" className="text-lg font-semibold">{activity.task.question}</p>
        <SpeakingUtteranceAudio sessionId={sessionId} messageId={messageId} part="question" text={activity.task.question} label="Ouvir pergunta guiada" />
        <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">Ver tradução da pergunta</summary><p lang="pt-BR" className="mt-2">{activity.task.question_translation}</p></details>
      </section> : null}
      <p className="text-xs font-medium text-muted-foreground">
        Expressão {activity.item_index + 1} de {activity.total_items}
      </p>
      <div data-speaking-focus={["WORD", "EXAMPLE"].includes(activity.step) ? true : undefined} className="space-y-3 rounded-2xl border border-border bg-muted/30 p-4">
        <div>
          <p className="font-semibold">{activity.item.expression}</p>
          {showTranslations ? <p className="text-sm text-muted-foreground">{activity.item.translation}</p> : null}
        </div>
        <VocabularyAudioButton text={activity.item.expression} label="Ouvir palavra ou expressão" requestAudio={wordAudio} />
        {showExample ? (
          <div data-speaking-focus={activity.step === "REPEAT" ? true : undefined} className="space-y-2 border-t border-border pt-3">
            <p>{activity.item.example}</p>
            {showTranslations ? <p className="text-sm text-muted-foreground">{activity.item.example_translation}</p> : null}
            <VocabularyAudioButton text={activity.item.example} label="Ouvir frase" requestAudio={exampleAudio} />
          </div>
        ) : null}
      </div>
      {activity.task ? (
        <div className="space-y-1 rounded-2xl bg-muted/40 p-3">
          <p className="text-xs font-medium text-muted-foreground">Você pode responder assim:</p>
          <p>{activity.task.model_answer}</p>
          {showTranslations ? <p className="text-sm text-muted-foreground">{activity.task.model_answer_translation}</p> : null}
          <SpeakingUtteranceAudio sessionId={sessionId} messageId={messageId} part="model_answer" text={activity.task.model_answer} label="Ouvir resposta modelo" />
        </div>
      ) : null}
      {!activity.show_translations ? (
        <button type="button" onClick={() => setShowTranslations((current) => !current)} className="text-xs underline">
          {showTranslations ? "Ocultar traduções" : "Ver traduções do vocabulário"}
        </button>
      ) : null}
      {activity.hint ? <p className="rounded-xl bg-muted/60 p-3 text-sm">{activity.hint}</p> : null}
      {activity.feedback && activity.step !== "FEEDBACK" ? <p className="text-sm">{activity.feedback}</p> : null}
      {activity.step === "FEEDBACK" && activity.assessment_source ? (
        <p className="text-xs text-muted-foreground">
          {activity.assessment_source === "transcript" ? "Feedback sobre a resposta transcrita." : "Feedback sobre sua resposta escrita."}
        </p>
      ) : null}
      {interactive && awaitingAnswer ? (
        <div className="space-y-2">
          <button type="button" disabled={disabled} onClick={onRecord}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
            <Mic className="h-4 w-4" />
            {activity.step === "REPEAT" ? "Repetir pelo microfone" : "Responder pelo microfone"}
          </button>
          <p className="text-xs text-muted-foreground">Se o microfone estiver indisponível, responda pelo campo de texto.</p>
        </div>
      ) : null}
      {activity.review_count ? <p className="text-xs text-muted-foreground">Expressões para revisar: {activity.review_count}.</p> : null}
    </section>
  );
};

export default SpeakingVocabularyActivity;
