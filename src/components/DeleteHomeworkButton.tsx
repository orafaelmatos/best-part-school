import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type DeleteHomeworkButtonProps = {
  homework: { id: string; title: string; student_name?: string };
  onDeleted?: () => void;
};

export const DeleteHomeworkButton = ({ homework, onDeleted }: DeleteHomeworkButtonProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/homework/${homework.id}/`),
    onSuccess: () => {
      setOpen(false);
      for (const key of [
        "homework",
        "teacher-homework",
        "student-homework",
        "student-lesson-homework-feed",
        "summary-homework",
        "dashboard-student-homework",
        "homework-templates",
      ]) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
      toast({ title: "Homework excluída com sucesso" });
      onDeleted?.();
    },
    onError: () => {
      toast({
        title: "Erro ao excluir homework",
        description: "Não foi possível excluir a homework. Tente novamente.",
        variant: "destructive",
      });
    },
  });

  if (user?.role !== "teacher" && user?.role !== "admin") return null;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (deleteMutation.isPending) return;
        deleteMutation.reset();
        setOpen(nextOpen);
      }}
    >
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          aria-label={`Excluir homework ${homework.title}`}
          disabled={deleteMutation.isPending}
        >
          <Trash2 className="mr-2 h-4 w-4" /> Excluir
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent onEscapeKeyDown={(event) => {
        if (deleteMutation.isPending) event.preventDefault();
      }}>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir homework?</AlertDialogTitle>
          <AlertDialogDescription>
            A homework “{homework.title}”{homework.student_name ? ` do aluno ${homework.student_name}` : ""} será
            excluída junto com suas perguntas, respostas e correções. Esta ação não pode ser desfeita.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {deleteMutation.isError && (
          <p role="alert" className="text-sm text-destructive">
            Não foi possível excluir a homework. Tente novamente.
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteMutation.isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={deleteMutation.isPending}
            onClick={(event) => {
              event.preventDefault();
              deleteMutation.mutate();
            }}
          >
            {deleteMutation.isPending ? "Excluindo..." : "Excluir homework"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
