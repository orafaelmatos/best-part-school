import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { APP_PATHS } from "@/lib/routes";

export const IniciarAulaModal = ({ onClose }: { onClose: () => void }) => {
  const navigate = useNavigate();
  const [studentId, setStudentId] = useState("");
  const [lessonId, setLessonId] = useState("");

  const { data: students = [] } = useQuery({
    queryKey: ["students"],
    queryFn: async () => {
      const res = await api.get("/accounts/users/");
      const usersData = Array.isArray(res.data) ? res.data : (res.data.results || []);
      return usersData.filter((u: any) => u.role === "student");
    }
  });

  const { data: allLessons = [] } = useQuery({
    queryKey: ["lessons"],
    queryFn: async () => {
      const res = await api.get("/lessons/");
      return Array.isArray(res.data) ? res.data : (res.data.results || []);
    }
  });

  const studentLessons = allLessons.filter((l: any) => l.student === studentId && l.status === "scheduled");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card border border-border p-6 rounded-xl w-full max-w-md">
        <h2 className="text-lg font-semibold mb-4">Iniciar Aula ao Vivo</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Selecionar Aluno</label>
            <select
              className="w-full p-2 rounded-lg border border-border bg-background"
              value={studentId}
              onChange={(e) => { setStudentId(e.target.value); setLessonId(""); }}
            >
              <option value="">Selecione um aluno...</option>
              {students.map((student: any) => (
                <option key={student.id} value={student.id}>
                  {student.name || student.email}
                </option>
              ))}
            </select>
          </div>

          {studentId && (
            <div>
              <label className="block text-sm font-medium mb-1">Selecionar Aula Agendada</label>
              <select
                className="w-full p-2 rounded-lg border border-border bg-background"
                value={lessonId}
                onChange={(e) => setLessonId(e.target.value)}
              >
                <option value="">Selecione uma aula...</option>
                {studentLessons.map((l: any) => (
                  <option key={l.id} value={l.id}>
                    {l.title} (Nível {l.level})
                  </option>
                ))}
              </select>
              {studentLessons.length === 0 && (
                <p className="text-xs text-muted-foreground mt-1">Este aluno não possui aulas agendadas.</p>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button 
              disabled={!studentId || !lessonId} 
              onClick={() => navigate(APP_PATHS.annotateLesson(lessonId))}
            >
              Começar Aula
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
