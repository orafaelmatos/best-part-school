import type { SimultaneousSegment, SimultaneousTiming } from "./interpreter";

export const SIMULTANEOUS_RATES = [0.6, 0.75, 0.8, 0.9, 1, 1.25];
export const audioTime = (seconds: number) => `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;

// Recording time excludes recorder pauses. Source time follows the media element,
// including its speed changes. Neither clock measures the learner's speaking skill.
export class SimultaneousTimeline {
  private accumulated = 0;
  private started: number | null = null;
  private source: { recordingStart: number; sourceStart: number; rate: number } | null = null;
  readonly segments: SimultaneousSegment[] = [];

  elapsed(now = performance.now()) {
    return this.accumulated + (this.started === null ? 0 : (now - this.started) / 1000);
  }
  resume(now = performance.now()) {
    if (this.started === null) this.started = now;
  }
  beginSource(position: number, rate: number, now = performance.now()) {
    this.endSource(position, now);
    this.source = { recordingStart: this.elapsed(now), sourceStart: position, rate };
  }
  endSource(position: number, now = performance.now()) {
    const source = this.source;
    this.source = null;
    const end = this.elapsed(now);
    if (!source || position <= source.sourceStart || end <= source.recordingStart) return;
    this.segments.push({ recording_start_seconds: source.recordingStart, recording_end_seconds: end,
      source_start_seconds: source.sourceStart, source_end_seconds: position, playback_rate: source.rate });
  }
  pause(position: number, now = performance.now()) {
    this.endSource(position, now);
    this.accumulated = this.elapsed(now);
    this.started = null;
  }
  finish(position: number, duration: number, completed: boolean, now = performance.now()): SimultaneousTiming {
    this.pause(position, now);
    return { version: 1, recording_duration_seconds: this.elapsed(now), source_duration_seconds: duration,
      source_completed: completed, segments: [...this.segments] };
  }
}

export const sourceAtRecordingTime = (timing: SimultaneousTiming, seconds: number) => {
  const segment = timing.segments.find((item) => seconds >= item.recording_start_seconds && seconds < item.recording_end_seconds);
  if (segment) {
    // Use the observed endpoints to absorb small browser scheduling differences.
    const fraction = (seconds - segment.recording_start_seconds) / (segment.recording_end_seconds - segment.recording_start_seconds);
    return { position: segment.source_start_seconds + fraction * (segment.source_end_seconds - segment.source_start_seconds), rate: segment.playback_rate, playing: true };
  }
  const previous = [...timing.segments].reverse().find((item) => item.recording_end_seconds <= seconds);
  return { position: previous?.source_end_seconds ?? 0, rate: previous?.playback_rate ?? timing.segments[0]?.playback_rate ?? 1, playing: false };
};
