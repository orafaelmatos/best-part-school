import { isAxiosError } from "axios";

export const recordingSupportError = (): string => {
  if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return "A gravação não está disponível neste navegador. Você pode responder por texto.";
  }
  return "";
};

export const preferredRecordingType = () => [
  "audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus",
].find((type) => typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported(type));

export const recordingExtension = (type: string) => {
  const mime = type.split(";")[0].toLowerCase();
  return ({ "audio/webm": "webm", "audio/mp4": "m4a", "audio/ogg": "ogg", "audio/wav": "wav", "audio/mpeg": "mp3" })[mime] || "bin";
};

export const microphoneError = (error: unknown) => {
  const name = error && typeof error === "object" && "name" in error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "O acesso ao microfone não foi permitido. Libere o acesso no navegador ou responda por texto.";
  if (name === "NotFoundError") return "Nenhum microfone foi encontrado. Conecte um microfone ou responda por texto.";
  if (name === "NotReadableError") return "Não consegui usar o microfone. Ele pode estar ocupado em outro aplicativo. Você também pode responder por texto.";
  return "Não foi possível gravar o áudio. Tente novamente ou responda por texto.";
};
export const audioRequestError = (error: unknown) => {
  if (isAxiosError(error)) {
    const data = error.response?.data;
    if (typeof data === "string" && !data.startsWith("<")) return data;
    if (Array.isArray(data) && typeof data[0] === "string") return data[0];
    if (data && typeof data === "object") {
      const message = data.detail || data.error || data.audio?.[0];
      if (typeof message === "string") return message;
    }
  }
  return "Não consegui processar sua gravação. Envie novamente ou responda por texto.";
};

export const audioRequestId = () => {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
};
