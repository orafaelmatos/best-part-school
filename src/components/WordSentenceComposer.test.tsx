import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import WordSentenceComposer from "./WordSentenceComposer";
import { api } from "@/lib/api";

const auth = vi.hoisted(() => ({ role: "student", user_id: "student-a" }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: auth }) }));
vi.mock("@/lib/api", () => ({ api: { post: vi.fn() } }));
const post = vi.mocked(api.post);
const item = { source_word: "happy", sentence: "I am happy.", translation: "Eu estou feliz." };

function setup(studentId?: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><WordSentenceComposer studentId={studentId} /></QueryClientProvider>);
  return { ...view, client };
}
function enterWord() {
  fireEvent.click(screen.getByRole("button", { name: /Adicionar uma palavra nova/ }));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "happy" } });
  fireEvent.click(screen.getByRole("button", { name: "Criar frase com IA" }));
}
afterEach(() => { cleanup(); vi.resetAllMocks(); auth.role = "student"; });

describe("WordSentenceComposer", () => {
  it("explains what to enter, creates a sentence at the server level, and waits for explicit saving", async () => {
    post.mockResolvedValue({ data: { item, level: "A1" } });
    setup();
    expect(screen.getByRole("button", { name: "Adicionar uma palavra nova para a IA criar uma frase para você" })).toBeInTheDocument();
    enterWord();
    expect(await screen.findByText(item.sentence)).toBeInTheDocument();
    expect(screen.getByText(item.translation)).toBeInTheDocument();
    expect(screen.getByText("Nível de referência: A1")).toBeInTheDocument();
    expect(post).toHaveBeenCalledExactlyOnceWith("/vocabulary-cards/generate-word-sentence/", { source_word: "happy", adjustment: "standard" });
    expect(screen.getByRole("button", { name: "Salvar frase para revisar" })).toBeEnabled();
  });

  it("rewrites the current sentence in either direction while preserving the original word", async () => {
    post.mockResolvedValueOnce({ data: { item, level: "A1" } });
    setup(); enterWord(); await screen.findByText(item.sentence);
    const harder = { ...item, sentence: "I am happy because my sister is here.", translation: "Estou feliz porque minha irmã está aqui." };
    post.mockResolvedValueOnce({ data: { item: harder, level: "A1" } });
    fireEvent.click(screen.getByRole("button", { name: "Refazer mais difícil" }));
    await screen.findByText(harder.sentence);
    expect(post).toHaveBeenLastCalledWith("/vocabulary-cards/generate-word-sentence/", { source_word: "happy", adjustment: "harder", previous_sentence: item.sentence });
    post.mockResolvedValueOnce({ data: { item, level: "A1" } });
    fireEvent.click(screen.getByRole("button", { name: "Refazer mais fácil" }));
    await screen.findByText(item.sentence);
    expect(post).toHaveBeenLastCalledWith("/vocabulary-cards/generate-word-sentence/", { source_word: "happy", adjustment: "easier", previous_sentence: harder.sentence });
    expect(screen.getByText("Nível de referência: A1")).toBeInTheDocument();
  });

  it("retains the sentence and translation if a rewrite fails", async () => {
    post.mockResolvedValueOnce({ data: { item, level: "A1" } });
    setup(); enterWord(); await screen.findByText(item.sentence);
    post.mockRejectedValueOnce(new Error("network"));
    fireEvent.click(screen.getByRole("button", { name: "Refazer mais fácil" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("frase anterior foram mantidas");
    expect(screen.getByText(item.sentence)).toBeInTheDocument();
    expect(screen.getByText(item.translation)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refazer mais fácil" })).toBeEnabled();
  });

  it("saves only the displayed version and refreshes vocabulary views", async () => {
    post.mockResolvedValueOnce({ data: { item, level: "A1" } });
    const { client } = setup(); const invalidate = vi.spyOn(client, "invalidateQueries");
    enterWord(); await screen.findByText(item.sentence);
    post.mockResolvedValueOnce({ data: { created: true } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar frase para revisar" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Frase salva!");
    expect(post).toHaveBeenLastCalledWith("/vocabulary-cards/save-word-sentence/", item);
    expect(screen.getByRole("button", { name: "Frase salva para revisar" })).toBeDisabled();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["vocabulary-dashboard"] });
  });

  it("scopes a teacher's generation and saving to the selected student", async () => {
    auth.role = "teacher";
    post.mockResolvedValueOnce({ data: { item, level: "B1" } });
    setup("student-b"); enterWord(); await screen.findByText(item.sentence);
    expect(post).toHaveBeenLastCalledWith("/vocabulary-cards/generate-word-sentence/", { source_word: "happy", adjustment: "standard", student_id: "student-b" });
    post.mockResolvedValueOnce({ data: { created: true } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar frase para revisar" }));
    await waitFor(() => expect(post).toHaveBeenLastCalledWith("/vocabulary-cards/save-word-sentence/", { ...item, student_id: "student-b" }));
  });

  it("never shows a late generation response in a different student's composer", async () => {
    auth.role = "teacher";
    let resolve!: (value: unknown) => void;
    post.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const { rerender, client } = setup("student-b"); enterWord();
    rerender(<QueryClientProvider client={client}><WordSentenceComposer studentId="student-c" /></QueryClientProvider>);
    await act(async () => resolve({ data: { item, level: "B1" } }));
    expect(screen.queryByText(item.sentence)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Adicionar uma palavra nova/ })).toBeInTheDocument();
  });
});
