import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FlashcardEditor } from "@/components/FlashcardEditor";
import { api } from "@/lib/api";

const auth = vi.hoisted(() => ({ role: "teacher" }));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { role: auth.role } }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/api", () => ({ api: { post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));

const drafts = [
  { source_word: "airport", sentence: "We are at the airport.", translation: "Estamos no aeroporto." },
  { source_word: "achievement", sentence: "This is a great achievement.", translation: "Esta é uma grande conquista." },
];
const lesson = { id: "lesson-1", level: "A2", new_words: [] };
const post = vi.mocked(api.post);

function renderEditor(onBeforePersist = vi.fn().mockResolvedValue(true)) {
  const refetch = vi.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <FlashcardEditor lesson={lesson} refetch={refetch} onBeforePersist={onBeforePersist} />
    </QueryClientProvider>,
  );
  return { ...view, refetch, onBeforePersist, queryClient };
}

function enterWords(input = "airport,\nachievement; Airport") {
  fireEvent.click(screen.getByRole("button", { name: "Gerar frases com IA" }));
  fireEvent.change(screen.getByLabelText("Lista de palavras ou expressões"), { target: { value: input } });
}

async function generateDrafts() {
  post.mockResolvedValueOnce({ data: { items: drafts } });
  enterWords();
  fireEvent.click(screen.getByRole("button", { name: "Gerar frases" }));
  await screen.findByText("Revise as sugestões");
}

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  auth.role = "teacher";
});

describe("Frases com IA nas anotações", () => {
  it("gera um rascunho com palavras únicas e aguarda aprovação antes de salvar", async () => {
    const { refetch } = renderEditor();
    await generateDrafts();

    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith("/lessons/lesson-1/generate-word-sentences/", { words: ["airport", "achievement"] });
    expect(screen.getByDisplayValue(drafts[0].sentence)).toBeInTheDocument();
    expect(screen.getByDisplayValue(drafts[0].translation)).toBeInTheDocument();
    expect(screen.getByText("Nenhuma palavra cadastrada ainda.")).toBeInTheDocument();
    expect(refetch).not.toHaveBeenCalled();
  });

  it("salva apenas as frases selecionadas com as correções do professor", async () => {
    const { refetch, onBeforePersist, queryClient } = renderEditor();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    await generateDrafts();
    fireEvent.change(screen.getAllByLabelText("Frase em inglês (frente)")[0], { target: { value: "I work at the airport." } });
    fireEvent.change(screen.getAllByLabelText("Tradução em português (verso)")[0], { target: { value: "Eu trabalho no aeroporto." } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Incluir achievement" }));
    post.mockResolvedValueOnce({ data: { created_count: 1, skipped_count: 0 } });
    fireEvent.click(screen.getByRole("button", { name: "Aprovar e salvar 1 frase" }));

    await waitFor(() => expect(refetch).toHaveBeenCalledOnce());
    expect(post).toHaveBeenLastCalledWith("/lessons/lesson-1/approve-word-sentences/", {
      items: [{ source_word: "airport", sentence: "I work at the airport.", translation: "Eu trabalho no aeroporto." }],
    });
    expect(onBeforePersist).toHaveBeenCalledTimes(2);
    expect(screen.queryByDisplayValue("I work at the airport.")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue(drafts[1].sentence)).toBeInTheDocument();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["vocabulary-cards"] });
  });

  it("exibe sugestões sem correspondência literal desmarcadas até a revisão do professor", async () => {
    const { refetch } = renderEditor();
    const warning = "Confira se a frase usa uma variação correta antes de selecionar para aprovação.";
    post.mockResolvedValueOnce({ data: { items: [
      drafts[0],
      { source_word: "take off", sentence: "She took her shoes off.", translation: "Ela tirou os sapatos.", review_warning: warning },
    ] } });
    enterWords("airport\ntake off");
    fireEvent.click(screen.getByRole("button", { name: "Gerar frases" }));
    await screen.findByText("Revise as sugestões");

    expect(screen.getByText(warning)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Incluir take off" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Incluir airport" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Aprovar e salvar 1 frase" })).toBeEnabled();
    expect(post).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getAllByLabelText("Frase em inglês (frente)")[1], { target: { value: "Please take off your shoes." } });
    fireEvent.change(screen.getAllByLabelText("Tradução em português (verso)")[1], { target: { value: "Por favor, tire os sapatos." } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Incluir take off" }));
    post.mockResolvedValueOnce({ data: { created_count: 2, skipped_count: 0 } });
    fireEvent.click(screen.getByRole("button", { name: "Aprovar e salvar 2 frases" }));
    await waitFor(() => expect(refetch).toHaveBeenCalledOnce());
    expect(post).toHaveBeenLastCalledWith("/lessons/lesson-1/approve-word-sentences/", {
      items: [drafts[0], { source_word: "take off", sentence: "Please take off your shoes.", translation: "Por favor, tire os sapatos." }],
    });
  });

  it("mantém as correções e permite tentar salvar novamente depois de um erro", async () => {
    const { refetch } = renderEditor();
    await generateDrafts();
    fireEvent.change(screen.getAllByLabelText("Tradução em português (verso)")[0], { target: { value: "Nós estamos no aeroporto." } });
    post.mockRejectedValueOnce(new Error("Network unavailable"));
    fireEvent.click(screen.getByRole("button", { name: "Aprovar e salvar 2 frases" }));
    await screen.findByRole("alert");

    expect(screen.getByDisplayValue("Nós estamos no aeroporto.")).toBeInTheDocument();
    expect(refetch).not.toHaveBeenCalled();
    post.mockResolvedValueOnce({ data: { created_count: 2, skipped_count: 0 } });
    fireEvent.click(screen.getByRole("button", { name: "Aprovar e salvar 2 frases" }));
    await waitFor(() => expect(refetch).toHaveBeenCalledOnce());
    expect(screen.getByLabelText("Lista de palavras ou expressões")).toHaveValue("");
  });

  it("mantém a lista de palavras se a geração falhar", async () => {
    renderEditor();
    enterWords("airport\nachievement");
    post.mockRejectedValueOnce(new Error("Unavailable"));
    fireEvent.click(screen.getByRole("button", { name: "Gerar frases" }));
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Lista de palavras ou expressões")).toHaveValue("airport\nachievement");
    expect(screen.getByRole("button", { name: "Gerar frases" })).toBeEnabled();
  });

  it("impede a geração com lista vazia ou acima do limite", () => {
    renderEditor();
    enterWords("");
    expect(screen.getByRole("button", { name: "Gerar frases" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Lista de palavras ou expressões"), {
      target: { value: Array.from({ length: 51 }, (_, index) => `word ${index}`).join("\n") },
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Use até 50 palavras");
    expect(screen.getByRole("button", { name: "Gerar frases" })).toBeDisabled();
    expect(post).not.toHaveBeenCalled();
  });

  it("exige frase e tradução apenas dos cards selecionados", async () => {
    renderEditor();
    await generateDrafts();
    fireEvent.change(screen.getAllByLabelText("Frase em inglês (frente)")[0], { target: { value: " " } });
    expect(screen.getByRole("button", { name: "Aprovar e salvar 2 frases" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Incluir airport" }));
    expect(screen.getByRole("button", { name: "Aprovar e salvar 1 frase" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Desmarcar todas" }));
    expect(screen.getByRole("button", { name: "Aprovar e salvar 0 frases" })).toBeDisabled();
  });

  it("respeita o bloqueio de salvamento das anotações antes de gerar", async () => {
    const onBeforePersist = vi.fn().mockResolvedValue(false);
    renderEditor(onBeforePersist);
    enterWords();
    fireEvent.click(screen.getByRole("button", { name: "Gerar frases" }));
    await waitFor(() => expect(onBeforePersist).toHaveBeenCalledOnce());
    expect(post).not.toHaveBeenCalled();
  });

  it("respeita o bloqueio de salvamento antes de aprovar e preserva o rascunho", async () => {
    const onBeforePersist = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    renderEditor(onBeforePersist);
    await generateDrafts();
    fireEvent.click(screen.getByRole("button", { name: "Aprovar e salvar 2 frases" }));
    await waitFor(() => expect(onBeforePersist).toHaveBeenCalledTimes(2));
    expect(post).toHaveBeenCalledTimes(1);
    expect(screen.getByDisplayValue(drafts[0].sentence)).toBeInTheDocument();
  });

  it("descarta sugestões sem publicar cards", async () => {
    renderEditor();
    await generateDrafts();
    fireEvent.click(screen.getByRole("button", { name: "Descartar sugestões" }));
    expect(screen.queryByText("Revise as sugestões")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Lista de palavras ou expressões")).toHaveValue("airport,\nachievement; Airport");
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("não exibe a geração para alunos", () => {
    auth.role = "student";
    renderEditor();
    expect(screen.queryByRole("button", { name: "Gerar frases com IA" })).not.toBeInTheDocument();
  });

  it("limpa os rascunhos ao trocar de aula", async () => {
    const { rerender, queryClient, refetch } = renderEditor();
    await generateDrafts();
    rerender(
      <QueryClientProvider client={queryClient}>
        <FlashcardEditor lesson={{ ...lesson, id: "lesson-2" }} refetch={refetch} />
      </QueryClientProvider>,
    );
    expect(screen.queryByText("Revise as sugestões")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue(drafts[0].sentence)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gerar frases com IA" })).toBeInTheDocument();
  });
});
