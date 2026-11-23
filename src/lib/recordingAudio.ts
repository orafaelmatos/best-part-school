const recordingMimeTypes = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
] as const;

export function supportedRecordingMimeType(recorder: typeof MediaRecorder): string | undefined {
  return recordingMimeTypes.find((mimeType) => recorder.isTypeSupported(mimeType));
}

export function recordingFileExtension(mimeType: string): string {
  const format = mimeType.split(";", 1)[0].trim().toLowerCase();
  if (format === "audio/mp4") return "mp4";
  if (["audio/wav", "audio/wave", "audio/x-wav"].includes(format)) return "wav";
  if (format === "audio/webm") return "webm";
  throw new Error(`Unsupported recording format: ${mimeType}`);
}
