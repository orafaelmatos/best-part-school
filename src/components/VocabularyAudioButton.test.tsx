import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import VocabularyAudioButton from "@/components/VocabularyAudioButton";
import { api } from "@/lib/api";

vi.mock("@/lib/api", () => ({ api: { post: vi.fn() } }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.clearAllMocks(); });

describe("Shared vocabulary and Speaking audio fallbacks", () => {
  it("releases a timed-out request and ignores its late result before retrying", async () => {
    let resolve: (url: string) => void;
    const requestAudio = vi.fn().mockImplementationOnce(() => new Promise<string>((done) => { resolve = done; }))
      .mockResolvedValueOnce("/media/retry.mp3");
    render(<VocabularyAudioButton text="Hello" requestAudio={requestAudio} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("status")).toHaveTextContent("Carregando áudio");
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(screen.getByRole("alert")).toHaveTextContent("Continue pelo texto");
    expect(screen.getByRole("button")).toBeEnabled();
    await act(async () => resolve("/media/late.mp3"));
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByRole("button")));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
  });

  it("does not regenerate audio when browser playback permission is denied", async () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValue(new DOMException("blocked", "NotAllowedError"));
    render(<VocabularyAudioButton cardId="word-1" text="Hello" audioUrl="/media/hello.mp3" />);
    await act(async () => fireEvent.click(screen.getByRole("button")));
    expect(api.post).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Continue pelo texto");
  });

  it("does not play a generated utterance after switching to another task", async () => {
    let resolve: (url: string) => void;
    const requestAudio = () => new Promise<string>((done) => { resolve = done; });
    const { rerender } = render(<VocabularyAudioButton text="First question" requestAudio={requestAudio} />);
    fireEvent.click(screen.getByRole("button"));
    rerender(<VocabularyAudioButton text="Second question" requestAudio={async () => "/media/second.mp3"} />);
    await act(async () => resolve("/media/old.mp3"));
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    expect(screen.getByRole("button")).toBeEnabled();
  });

  it("stops playback on unmount and offers written fallback on a media error", () => {
    const { container, unmount } = render(<VocabularyAudioButton text="Hello" audioUrl="/media/hello.mp3" />);
    fireEvent.error(container.querySelector("audio")!);
    expect(screen.getByRole("alert")).toHaveTextContent("Continue pelo texto");
    const calls = vi.mocked(HTMLMediaElement.prototype.pause).mock.calls.length;
    unmount();
    expect(vi.mocked(HTMLMediaElement.prototype.pause).mock.calls.length).toBeGreaterThan(calls);
  });
});
