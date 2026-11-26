import AudioPlayer from "@/components/AudioPlayer";
import { absoluteMediaUrl } from "@/lib/config";

type Props = {
  imageUrl?: string | null;
  audioUrl?: string | null;
  audioTranscript?: string | null;
  showTranscript?: boolean;
  className?: string;
};

// Shared by the student activity screen and the teacher correction pages: only token classes here.
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
    <div className={`min-w-0 space-y-3 ${className}`.trim()}>
      {resolvedImageUrl ? (
        <div className="overflow-hidden rounded-lg border border-line bg-surface-muted">
          <img src={resolvedImageUrl} alt="Imagem da pergunta" className="max-h-80 w-full object-contain" />
        </div>
      ) : null}
      {resolvedAudioUrl ? <AudioPlayer src={resolvedAudioUrl} compact /> : null}
      {showTranscript && audioTranscript ? (
        <div className="rounded-lg bg-surface-muted px-4 py-3">
          <p className="text-label text-ink">Transcrição sugerida</p>
          <p lang="en" className="mt-1 whitespace-pre-wrap text-body text-ink">{audioTranscript}</p>
        </div>
      ) : null}
    </div>
  );
};

export default HomeworkQuestionMedia;
