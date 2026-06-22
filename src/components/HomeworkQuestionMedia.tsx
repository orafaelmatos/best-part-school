import AudioPlayer from "@/components/AudioPlayer";
import { absoluteMediaUrl } from "@/lib/config";

type Props = {
  imageUrl?: string | null;
  audioUrl?: string | null;
  audioTranscript?: string | null;
  showTranscript?: boolean;
  className?: string;
};

const HomeworkQuestionMedia = ({
  imageUrl,
  audioUrl,
  audioTranscript,
  showTranscript = false,
  className = "",
}: Props) => {
  const resolvedImageUrl = imageUrl && /^(https?:|blob:|data:)/i.test(imageUrl) ? imageUrl : absoluteMediaUrl(imageUrl);
  const resolvedAudioUrl = audioUrl && /^(https?:|blob:|data:)/i.test(audioUrl) ? audioUrl : absoluteMediaUrl(audioUrl);

  if (!resolvedImageUrl && !resolvedAudioUrl && !(showTranscript && audioTranscript)) {
    return null;
  }

  return (
    <div className={`space-y-3 ${className}`.trim()}>
      {resolvedImageUrl ? (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <img src={resolvedImageUrl} alt="Imagem da pergunta" className="max-h-80 w-full object-contain bg-muted/20" />
        </div>
      ) : null}
      {resolvedAudioUrl ? <AudioPlayer src={resolvedAudioUrl} compact /> : null}
      {showTranscript && audioTranscript ? (
        <div className="rounded-lg border border-border bg-muted/40 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Transcrição sugerida</p>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{audioTranscript}</p>
        </div>
      ) : null}
    </div>
  );
};

export default HomeworkQuestionMedia;
