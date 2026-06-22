import { absoluteMediaUrl } from "@/lib/config";

type VocabularyAudioSource = {
  audio_url?: string | null;
  audio_file_url?: string | null;
};

export const resolveVocabularyAudioUrl = (source: VocabularyAudioSource) => {
  return absoluteMediaUrl(source.audio_file_url || source.audio_url);
};
