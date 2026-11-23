import { useCallback } from "react";
import VocabularyAudioButton from "@/components/VocabularyAudioButton";
import { api } from "@/lib/api";

type Props = { sessionId: string; messageId: string; question: string };

const SpeakingSimulationReplay = ({ sessionId, messageId, question }: Props) => {
  const requestAudio = useCallback(async () => {
    const response = await api.post(`/ai-study/sessions/${sessionId}/simulation-audio/`, { message_id: messageId });
    return response.data.audio_url as string;
  }, [sessionId, messageId]);

  return <VocabularyAudioButton text={question} label="Repetir" requestAudio={requestAudio} />;
};

export default SpeakingSimulationReplay;
