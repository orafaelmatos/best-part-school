import { describe, expect, it } from "vitest";
import { SimultaneousTimeline, sourceAtRecordingTime } from "./simultaneousAudio";

describe("SimultaneousTimeline", () => {
  it("removes joint pauses from recording time and retains speed changes", () => {
    const timeline = new SimultaneousTimeline();
    timeline.resume(1000); timeline.beginSource(0, 1, 1100);
    timeline.pause(4, 5100);
    expect(timeline.elapsed(30000)).toBeCloseTo(4.1);
    timeline.resume(30000); timeline.beginSource(4, 0.75, 30000);
    timeline.endSource(10, 38000);
    const result = timeline.finish(10, 10, true, 40000);
    expect(result.recording_duration_seconds).toBeCloseTo(14.1);
    expect(result.segments).toHaveLength(2);
    expect(result.segments[1].recording_start_seconds).toBeCloseTo(4.1);
    expect(result.segments[1].recording_end_seconds).toBeCloseTo(12.1);
    expect(sourceAtRecordingTime(result, 8.1)).toMatchObject({ position: 7, rate: 0.75, playing: true });
    expect(sourceAtRecordingTime(result, 13)).toMatchObject({ position: 10, playing: false });
  });
  it("keeps buffering gaps and interpreter delay in the recording timeline", () => {
    const timeline = new SimultaneousTimeline();
    timeline.resume(0); timeline.beginSource(0, 1, 500); timeline.endSource(3, 3500);
    timeline.beginSource(3, 1.25, 5500);
    const timing = timeline.finish(8, 8, true, 9500);
    expect(sourceAtRecordingTime(timing, 0)).toMatchObject({ position: 0, playing: false });
    expect(sourceAtRecordingTime(timing, 4)).toMatchObject({ position: 3, playing: false });
    expect(sourceAtRecordingTime(timing, 7.5)).toMatchObject({ position: 5.5, rate: 1.25, playing: true });
  });
  it("does not add zero length segments or extend a stopped recording", () => {
    const timeline = new SimultaneousTimeline();
    timeline.resume(0); timeline.beginSource(0, 1, 0); timeline.endSource(0, 0);
    timeline.beginSource(0, 1, 0); timeline.pause(2, 2000); timeline.pause(2, 7000);
    expect(timeline.elapsed(9000)).toBe(2);
    expect(timeline.segments).toHaveLength(1);
  });
});
