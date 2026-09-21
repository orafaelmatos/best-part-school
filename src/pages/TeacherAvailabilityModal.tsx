import { useState, useEffect } from "react";
import { X, Plus, Trash } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

const DAYS_OF_WEEK = [
  { value: 0, label: "Segunda-feira" },
  { value: 1, label: "Terça-feira" },
  { value: 2, label: "Quarta-feira" },
  { value: 3, label: "Quinta-feira" },
  { value: 4, label: "Sexta-feira" },
  { value: 5, label: "Sábado" },
  { value: 6, label: "Domingo" },
];

export default function TeacherAvailabilityModal({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [slots, setSlots] = useState<{day_of_week: number, start: string, end: string}[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ['teacher-availability-edit', user?.user_id],
    queryFn: async () => {
      const res = await api.get(`/teacher-availability/${user?.user_id}/`);
      return res.data;
    },
    enabled: !!user?.user_id,
  });

  useEffect(() => {
    if (data?.slots) {
      setSlots(data.slots);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async (newSlots: any[]) => {
      return api.post(`/teacher-availability/${user?.user_id}/`, { slots: newSlots });
    },
    onSuccess: () => {
      toast({ title: "Configuração salva", description: "Sua disponibilidade foi atualizada." });
      queryClient.invalidateQueries({ queryKey: ["teacher-availability"] });
      queryClient.invalidateQueries({ queryKey: ["teacher-availability-edit"] });
      onClose();
    },
    onError: () => {
       toast({ title: "Erro", description: "Não foi possível salvar os horários.", variant: "destructive" });
    }
  });

  const addSlot = (day: number) => {
    setSlots([...slots, { day_of_week: day, start: "08:00:00", end: "18:00:00" }]);
  };

  const removeSlot = (index: number) => {
    setSlots(slots.filter((_, i) => i !== index));
  };

  const updateSlot = (index: number, field: string, value: any) => {
    const newSlots = [...slots];
    newSlots[index] = { ...newSlots[index], [field]: value };
    setSlots(newSlots);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/20 p-3 pb-[calc(0.75rem_+_env(safe-area-inset-bottom))] pt-[calc(0.75rem_+_env(safe-area-inset-top))] sm:items-center sm:p-4">
      <div className="max-h-[calc(100dvh_-_1.5rem_-_env(safe-area-inset-top)_-_env(safe-area-inset-bottom))] w-full max-w-2xl overflow-y-auto rounded-2xl bg-card p-4 shadow-lg sm:max-h-[90vh] sm:p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">Meus Horários de Trabalho</h2>
          <button onClick={onClose} className="p-2 hover:bg-accent rounded-lg">
            <X size={20} />
          </button>
        </div>

        {isLoading ? (
          <p>Carregando...</p>
        ) : (
          <div className="space-y-6">
            {DAYS_OF_WEEK.map(day => {
              const daySlots = slots.map((s, i) => ({ ...s, index: i })).filter(s => s.day_of_week === day.value);
              
              return (
                <div key={day.value} className="border border-border p-4 rounded-xl">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold">{day.label}</h3>
                    <button 
                      onClick={() => addSlot(day.value)}
                      className="text-sm flex items-center gap-1 text-primary hover:text-primary/80"
                    >
                      <Plus size={16} /> Adicionar Horário
                    </button>
                  </div>
                  
                  {daySlots.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Não trabalha neste dia.</p>
                  ) : (
                    <div className="space-y-2">
                       {daySlots.map(slot => (
                         <div key={slot.index} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                           <input 
                             type="time" 
                             step={1800}
                             value={slot.start.substring(0,5)} 
                             onChange={(e) => updateSlot(slot.index, 'start', e.target.value + ":00")}
                             className="w-full rounded-md border border-border px-3 py-2 text-sm sm:w-auto"
                           />
                           <span className="text-sm text-muted-foreground">até</span>
                           <input 
                             type="time" 
                             step={1800}
                             value={slot.end.substring(0,5)} 
                             onChange={(e) => updateSlot(slot.index, 'end', e.target.value + ":00")}
                             className="w-full rounded-md border border-border px-3 py-2 text-sm sm:w-auto"
                           />
                           <button onClick={() => removeSlot(slot.index)} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md p-1.5 text-destructive hover:bg-destructive/10" aria-label="Remover horário">
                             <Trash size={16} />
                           </button>
                         </div>
                       ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        
        <div className="mt-6 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:justify-end">
          <button onClick={onClose} className="min-h-11 rounded-lg border border-border px-4 py-2 font-medium hover:bg-muted">
            Cancelar
          </button>
          <button onClick={() => saveMutation.mutate(slots)} disabled={saveMutation.isPending} className="min-h-11 rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground hover:bg-primary/90">
            {saveMutation.isPending ? "Salvando..." : "Salvar Horários"}
          </button>
        </div>
      </div>
    </div>
  );
}
