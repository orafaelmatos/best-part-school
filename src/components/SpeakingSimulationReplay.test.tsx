import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SpeakingSimulationReplay from "@/components/SpeakingSimulationReplay";
import { api } from "@/lib/api";

vi.mock("@/lib/api", () => ({ api: { post: vi.fn() } }));

describe("Speaking simulation replay", () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("requests and plays the saved English question through the dedicated endpoint", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { audio_url: "/media/question.mp3" } });
    render(<SpeakingSimulationReplay sessionId="session-1" messageId="message-1" question="What's your name?" />);
    fireEvent.click(screen.getByRole("button", { name: "Repetir" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      "/ai-study/sessions/session-1/simulation-audio/", { message_id: "message-1" },
    ));
    expect(api.post).toHaveBeenCalledOnce();
    await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce());
  });

  it("does not request or play audio on reload until the learner clicks", () => {
    render(<SpeakingSimulationReplay sessionId="session-1" messageId="message-1" question="What's your name?" />);
    expect(api.post).not.toHaveBeenCalled();
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });

  it("keeps a clear text alternative if the question can no longer be replayed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(api.post).mockRejectedValue(new Error("question changed"));
    render(<SpeakingSimulationReplay sessionId="session-1" messageId="message-1" question="What's your name?" />);
    fireEvent.click(screen.getByRole("button", { name: "Repetir" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("exemplo escrito");
    expect(screen.getByRole("button", { name: "Repetir" })).toBeEnabled();
  });
});
