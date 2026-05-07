import { memo, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock, Loader2 } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

type TimeSlot = {
  time: string;
  datetime: string;
  available: boolean;
  reason?: "busy" | "blocked" | "past" | null;
};

type ScheduleSlotPickerProps = {
  teacherId?: string;
  value?: string;
  excludeLessonId?: string;
  onChange: (isoDatetime: string) => void;
};

const reasonLabel: Record<string, string> = {
  busy: "Ocupado",
  blocked: "Bloqueado",
  past: "Passou",
};

const toLocalDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const ScheduleSlotPicker = memo(({ teacherId, value, excludeLessonId, onChange }: ScheduleSlotPickerProps) => {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(() => value ? new Date(value) : new Date());
  const selectedDateKey = useMemo(() => selectedDate ? toLocalDateKey(selectedDate) : "", [selectedDate]);

  const { data, isFetching } = useQuery({
    queryKey: ["teacher-day-slots", teacherId, selectedDateKey, excludeLessonId],
    queryFn: async () => {
      const res = await api.get(`/teacher-availability/${teacherId}/`, {
        params: {
          date: selectedDateKey,
          exclude_lesson: excludeLessonId,
        },
      });
      return res.data;
    },
    enabled: !!teacherId && !!selectedDateKey,
    staleTime: 15_000,
  });

  const slots: TimeSlot[] = data?.time_slots || [];
  const selectedTime = value ? new Date(value).toTimeString().slice(0, 5) : "";

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-[310px_1fr]">
        <div className="border-b lg:border-b-0 lg:border-r border-border bg-muted/30">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={setSelectedDate}
            disabled={{ before: new Date(new Date().setHours(0, 0, 0, 0)) }}
            className="w-full"
          />
        </div>

        <div className="p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Horários disponíveis</p>
              <p className="text-xs text-muted-foreground">
                {selectedDate?.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
              </p>
            </div>
            {isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>

          {!teacherId ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Selecione um professor para carregar a agenda.
            </div>
          ) : slots.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Nenhum horário configurado para este dia.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
              {slots.map((slot) => {
                const selected = selectedTime === slot.time && value?.startsWith(selectedDateKey);
                return (
                  <button
                    key={slot.datetime}
                    type="button"
                    disabled={!slot.available}
                    onClick={() => onChange(slot.datetime)}
                    className={cn(
                      "group min-h-14 rounded-lg border px-3 py-2 text-left transition-all",
                      "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background",
                      slot.available && "border-primary/20 bg-background hover:border-primary hover:bg-primary/5 hover:shadow-sm",
                      selected && "border-primary bg-primary text-primary-foreground shadow-sm hover:bg-primary",
                      !slot.available && "cursor-not-allowed border-border bg-muted/70 text-muted-foreground opacity-75"
                    )}
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <Clock className="h-3.5 w-3.5" />
                      {slot.time}
                    </span>
                    <span className={cn("mt-1 block text-[11px]", selected ? "text-primary-foreground/80" : "text-muted-foreground")}>
                      {slot.available ? "Livre" : reasonLabel[slot.reason || "busy"] || "Indisponível"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

ScheduleSlotPicker.displayName = "ScheduleSlotPicker";

export default ScheduleSlotPicker;
