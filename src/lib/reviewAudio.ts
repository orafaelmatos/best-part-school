// The audio evaluator accepts PCM WAV. Decode the browser recording locally.
export async function reviewAudioAsWav(blob: Blob): Promise<Blob> {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    // MediaRecorder may deliver its final chunk just after the automatic stop.
    if (decoded.duration > 122) throw new Error("Grave uma resposta de até dois minutos.");
    const renderer = new OfflineAudioContext(1, Math.ceil(Math.min(decoded.duration, 120) * 24000), 24000);
    const source = renderer.createBufferSource();
    source.buffer = decoded;
    source.connect(renderer.destination);
    source.start();
    const audio = await renderer.startRendering();
    return encodeReviewWav(audio.getChannelData(0), audio.sampleRate);
  } finally {
    await context.close();
  }
}

export function encodeReviewWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const write = (offset: number, text: string) => [...text].forEach((letter, i) => view.setUint8(offset + i, letter.charCodeAt(0)));
  write(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, i) => {
    const clipped = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + i * 2, clipped * (clipped < 0 ? 0x8000 : 0x7fff), true);
  });
  return new Blob([buffer], { type: "audio/wav" });
}
