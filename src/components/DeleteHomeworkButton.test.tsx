import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeleteHomeworkButton } from "./DeleteHomeworkButton";
import { api } from "@/lib/api";

const { toast, auth } = vi.hoisted(() => ({
  toast: vi.fn(),
  auth: { user: { role: "teacher" } as { role: string } | null },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/lib/api", () => ({ api: { delete: vi.fn() } }));

const homework = { id: "homework-1", title: "Writing task", student_name: "Ana" };
const deleteHomework = vi.mocked(api.delete);

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const onDeleted = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <DeleteHomeworkButton homework={homework} onDeleted={onDeleted} />
    </QueryClientProvider>,
  );
  return { queryClient, onDeleted };
}

beforeEach(() => { auth.user = { role: "teacher" }; });
afterEach(() => { cleanup(); vi.resetAllMocks(); });

describe("Exclusão de homework", () => {
  it("identifies the homework and student and allows cancelling without deleting", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Excluir homework Writing task" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Writing task” do aluno Ana");
    expect(screen.getByRole("alertdialog")).toHaveTextContent("perguntas, respostas e correções");
    expect(deleteHomework).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(deleteHomework).not.toHaveBeenCalled();
  });

  it("deletes after confirmation and refreshes homework lists and counts", async () => {
    deleteHomework.mockResolvedValue({ data: undefined });
    const { queryClient, onDeleted } = setup();
    const keys = [
      ["teacher-homework"], ["homework", "lesson-1"], ["student-homework"],
      ["student-lesson-homework-feed", "student-1"], ["summary-homework", "student-1"],
      ["dashboard-student-homework", "student-1"], ["homework-templates"],
    ];
    for (const key of [...keys, ["lessons"]]) queryClient.setQueryData(key, []);
    fireEvent.click(screen.getByRole("button", { name: "Excluir homework Writing task" }));
    fireEvent.click(screen.getByRole("button", { name: "Excluir homework" }));

    await waitFor(() => expect(onDeleted).toHaveBeenCalledOnce());
    expect(deleteHomework).toHaveBeenCalledExactlyOnceWith("/homework/homework-1/");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    for (const key of keys) expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(["lessons"])?.isInvalidated).toBe(false);
    expect(toast).toHaveBeenCalledWith({ title: "Homework excluída com sucesso" });
  });

  it("keeps the confirmation open on failure and lets the teacher retry", async () => {
    deleteHomework.mockRejectedValueOnce(new Error("Network error")).mockResolvedValueOnce({ data: undefined });
    const { onDeleted, queryClient } = setup();
    queryClient.setQueryData(["teacher-homework"], [homework]);
    fireEvent.click(screen.getByRole("button", { name: "Excluir homework Writing task" }));
    fireEvent.click(screen.getByRole("button", { name: "Excluir homework" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível excluir");
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(queryClient.getQueryState(["teacher-homework"])?.isInvalidated).toBe(false);
    expect(onDeleted).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Excluir homework" }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalledOnce());
    expect(deleteHomework).toHaveBeenCalledTimes(2);
  });

  it("prevents repeated confirmation and closing while deletion is pending", async () => {
    let finishDeletion!: () => void;
    deleteHomework.mockImplementation(() => new Promise((resolve) => {
      finishDeletion = () => resolve({ data: undefined });
    }));
    const { onDeleted } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Excluir homework Writing task" }));
    fireEvent.click(screen.getByRole("button", { name: "Excluir homework" }));
    const pendingButton = await screen.findByRole("button", { name: "Excluindo..." });
    expect(pendingButton).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    fireEvent.click(pendingButton);
    fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape" });
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(deleteHomework).toHaveBeenCalledOnce();
    finishDeletion();
    await waitFor(() => expect(onDeleted).toHaveBeenCalledOnce());
  });

  it.each([null, { role: "student" }])("hides deletion from unauthorized users (%j)", (user) => {
    auth.user = user;
    setup();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("also allows administrators to delete", () => {
    auth.user = { role: "admin" };
    setup();
    expect(screen.getByRole("button", { name: "Excluir homework Writing task" })).toBeInTheDocument();
  });
});
