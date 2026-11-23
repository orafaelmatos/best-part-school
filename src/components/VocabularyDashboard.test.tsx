import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import VocabularyDashboard from "./VocabularyDashboard";
import { api } from "@/lib/api";

const auth = vi.hoisted(() => ({ role: "student", user_id: "student-a" }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: auth }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), post: vi.fn() } }));

const post = vi.mocked(api.post);
const get = vi.mocked(api.get);
const items = [
  { source_word: "airport", sentence: "We are at the airport.", translation: "Estamos no aeroporto." },
  { source_word: "happy", sentence: "I am happy.", translation: "Estou feliz." },
];
function setup() {
  get.mockImplementation(async () => ({ data: [] }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return { ...render(<QueryClientProvider client={client}><VocabularyDashboard /></QueryClientProvider>), client };
}
function enterWords(value = "airport, happy; Airport\n HAPPY") {
  fireEvent.click(screen.getByRole("button", { name: /Adicionar nova palavra/ }));
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Gerar frases com IA" }), { button: 0, ctrlKey: false });
  fireEvent.change(screen.getByLabelText("Lista de palavras ou expressões"), { target: { value } });
}
async function generate() {
  post.mockResolvedValueOnce({ data: { items, level: "A1" } });
  enterWords();
  fireEvent.click(screen.getByRole("button", { name: "Gerar frases" }));
  await screen.findByText("Revise as sugestões");
}
afterEach(() => { cleanup(); vi.resetAllMocks(); auth.role = "student"; });

describe("Frases em lote na página de palavras", () => {
  it("gera uma lista sem duplicatas no nível do aluno e aguarda o salvamento", async () => {
    setup();
    await generate();
    expect(post).toHaveBeenCalledExactlyOnceWith("/vocabulary-cards/generate-word-sentences/", { words: ["airport", "happy"] });
    expect(get.mock.calls.map(([url]) => url)).not.toContain("/vocabulary-cards/sentence-students/");
    expect(screen.getByDisplayValue(items[0].sentence)).toBeInTheDocument();
    expect(screen.getByDisplayValue(items[1].translation)).toBeInTheDocument();
    expect(screen.getAllByText(/Nível de referência: A1/)).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Salvar 2 frases" })).toBeEnabled();
  });

  it("salva apenas as sugestões escolhidas e editadas e atualiza as revisões", async () => {
    const { client } = setup();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    await generate();
    fireEvent.change(screen.getAllByLabelText("Frase em inglês (frente)")[0], { target: { value: "I work at the airport." } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Incluir happy" }));
    post.mockResolvedValueOnce({ data: { created_count: 1, skipped_count: 0 } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar 1 frase" }));
    await waitFor(() => expect(screen.queryByDisplayValue("I work at the airport.")).not.toBeInTheDocument());
    expect(post).toHaveBeenLastCalledWith("/vocabulary-cards/save-word-sentences/", { items: [{ ...items[0], sentence: "I work at the airport." }] });
    expect(screen.getByDisplayValue(items[1].sentence)).toBeInTheDocument();
    for (const key of ["vocabulary-cards", "vocabulary-dashboard", "sidebar-badges"]) {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: [key] });
    }
  });

  it("ajusta somente a frase escolhida e mantém as outras sugestões", async () => {
    setup(); await generate();
    const row = screen.getByRole("group", { name: "Sugestão com airport" });
    const rewritten = { ...items[0], sentence: "I work at the airport because I like planes." };
    post.mockResolvedValueOnce({ data: { item: rewritten, level: "A1" } });
    fireEvent.click(within(row).getByRole("button", { name: "Refazer mais difícil" }));
    await screen.findByDisplayValue(rewritten.sentence);
    expect(post).toHaveBeenLastCalledWith("/vocabulary-cards/generate-word-sentence/", { source_word: "airport", previous_sentence: items[0].sentence, adjustment: "harder" });
    expect(screen.getByDisplayValue(items[1].sentence)).toBeInTheDocument();
  });

  it("mantém a lista e as correções após erros e permite tentar novamente", async () => {
    setup(); enterWords("airport\nhappy");
    post.mockRejectedValueOnce(new Error("offline"));
    fireEvent.click(screen.getByRole("button", { name: "Gerar frases" }));
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Lista de palavras ou expressões")).toHaveValue("airport\nhappy");
    post.mockResolvedValueOnce({ data: { items, level: "A1" } });
    fireEvent.click(screen.getByRole("button", { name: "Gerar frases" }));
    await screen.findByText("Revise as sugestões");
    fireEvent.change(screen.getAllByLabelText("Tradução em português (verso)")[0], { target: { value: "Nós estamos no aeroporto." } });
    post.mockRejectedValueOnce(new Error("offline"));
    fireEvent.click(screen.getByRole("button", { name: "Salvar 2 frases" }));
    await screen.findByRole("alert");
    expect(screen.getByDisplayValue("Nós estamos no aeroporto.")).toBeInTheDocument();
    post.mockResolvedValueOnce({ data: { created_count: 2, skipped_count: 0 } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar 2 frases" }));
    await waitFor(() => expect(screen.getByLabelText("Lista de palavras ou expressões")).toHaveValue(""));
  });

  it("bloqueia listas vazias, mais de 50 palavras e palavras longas", () => {
    setup(); enterWords("");
    expect(screen.getByRole("button", { name: "Gerar frases" })).toBeDisabled();
    for (const value of [Array.from({ length: 51 }, (_, i) => `word ${i}`).join("\n"), "a".repeat(101)]) {
      fireEvent.change(screen.getByLabelText("Lista de palavras ou expressões"), { target: { value } });
      expect(screen.getByRole("button", { name: "Gerar frases" })).toBeDisabled();
    }
    expect(post).not.toHaveBeenCalled();
  });

  it.each(["student", "teacher"])("oferece cadastro manual e IA no mesmo diálogo para %s", async (role) => {
    auth.role = role;
    setup();
    expect(screen.queryByRole("region", { name: "Frases com IA" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Adicionar nova palavra/ }));
    expect(screen.getByRole("dialog", { name: "Adicionar nova palavra" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Cadastrar palavra" })).toHaveAttribute("aria-selected", "true");
    fireEvent.change(screen.getByPlaceholderText("Palavra ou expressão"), { target: { value: "airport" } });
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Gerar frases com IA" }), { button: 0, ctrlKey: false });
    expect(screen.getByLabelText("Lista de palavras ou expressões")).toHaveValue("airport");
    expect(screen.queryByLabelText("Aluno que vai praticar")).not.toBeInTheDocument();
    post.mockResolvedValueOnce({ data: { items: [items[0]], level: "B2" } });
    fireEvent.click(screen.getByRole("button", { name: "Gerar frases" }));
    await screen.findByText("Revise as sugestões");
    expect(post).toHaveBeenLastCalledWith("/vocabulary-cards/generate-word-sentences/", { words: ["airport"] });
    post.mockResolvedValueOnce({ data: { item: items[0], level: "B2" } });
    fireEvent.click(screen.getByRole("button", { name: "Refazer mais fácil" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Salvar 1 frase" })).toBeEnabled());
    expect(post).toHaveBeenLastCalledWith("/vocabulary-cards/generate-word-sentence/", { source_word: "airport", previous_sentence: items[0].sentence, adjustment: "easier" });
    post.mockResolvedValueOnce({ data: { created_count: 1, skipped_count: 0 } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar 1 frase" }));
    await waitFor(() => expect(screen.getByLabelText("Lista de palavras ou expressões")).toHaveValue(""));
    expect(post).toHaveBeenLastCalledWith("/vocabulary-cards/save-word-sentences/", { items: [items[0]] });
  });

  it("mantém o cadastro manual disponível para o próprio professor", async () => {
    auth.role = "teacher";
    setup();
    fireEvent.click(screen.getByRole("button", { name: /Adicionar nova palavra/ }));
    fireEvent.change(screen.getByPlaceholderText("Palavra ou expressão"), { target: { value: "happy" } });
    fireEvent.change(screen.getByPlaceholderText("Tradução"), { target: { value: "feliz" } });
    post.mockResolvedValueOnce({ data: { id: "personal-card" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar palavra" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(post).toHaveBeenCalledExactlyOnceWith("/vocabulary-cards/", expect.objectContaining({ word: "happy", translation: "feliz", category: null }));
    expect(post.mock.calls[0][1]).not.toHaveProperty("student_id");
    expect(post.mock.calls[0][1]).not.toHaveProperty("student");
  });

  it("limpa o rascunho ao fechar o diálogo e ignora uma resposta atrasada", async () => {
    setup();
    let resolve!: (value: unknown) => void;
    post.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    enterWords(); fireEvent.click(screen.getByRole("button", { name: "Gerar frases" }));
    await waitFor(() => expect(post).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await act(async () => resolve({ data: { items, level: "B1" } }));
    enterWords("");
    expect(screen.queryByText("Revise as sugestões")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Lista de palavras ou expressões")).toHaveValue("");
  });
});
