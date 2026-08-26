import { memo, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Clock } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type RecurringSlot = { day: string; time: string };
type AvailabilitySlot = { day_of_week: number; start: string; end: string };
type RecurringBusySlot = { day_of_week: number; start_time: string; student_name?: string };
const SLOT_INTERVAL_MINUTES = 30;
const LESSON_DURATION_MINUTES = 60;

const DAYS = [
  { value: 0, label: "Seg", full: "Segunda" },
  { value: 1, label: "Ter", full: "Terça" },
  { value: 2, label: "Qua", full: "Quarta" },
  { value: 3, label: "Qui", full: "Quinta" },
  { value: 4, label: "Sex", full: "Sexta" },
  { value: 5, label: "Sáb", full: "Sábado" },
  { value: 6, label: "Dom", full: "Domingo" },
];

const toLocalDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const nextDateForWeekday = (weekday: number) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const jsDay = today.getDay() === 0 ? 6 : today.getDay() - 1;
  let diff = weekday - jsDay;
  if (diff < 0) diff += 7;
  const target = new Date(today);
  target.setDate(today.getDate() + diff);
  return target;
};

const toMinutes = (time: string) => {
  const [hours, minutes] = time.slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
};

const toTime = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

const slotOverlaps = (startTime: string, otherStartTime: string) => {
  const start = toMinutes(startTime);
  const otherStart = toMinutes(otherStartTime);
  return start < otherStart + LESSON_DURATION_MINUTES && otherStart < start + LESSON_DURATION_MINUTES;
};

const buildHalfHourSlots = (availability: AvailabilitySlot[]) => {
  const times = new Set<string>();
  availability.forEach((slot) => {
    let cursor = toMinutes(slot.start);
    const end = toMinutes(slot.end);

    while (cursor + LESSON_DURATION_MINUTES <= end) {
      times.add(toTime(cursor));
      cursor += SLOT_INTERVAL_MINUTES;
    }
  });
  return Array.from(times).sort();
};

const RecurringSchedulePicker = memo(({ teacherId, value, onChange }: {
  teacherId?: string;
  value: RecurringSlot[];
  onChange: (slots: RecurringSlot[]) => void;
}) => {
  const { data, isLoading } = useQuery({
    queryKey: ["teacher-availability-recurring", teacherId],
    queryFn: async () => {
      const res = await api.get(`/teacher-availability/${teacherId}/`);
      return res.data;
    },
    enabled: !!teacherId,
    staleTime: 15_000,
  });

  const busy = data?.busy || [];
  const blocked = data?.blocked || [];
  const recurringBusy: RecurringBusySlot[] = data?.recurring_busy || [];
  const availabilityByDay = useMemo(() => {
    const groups: Record<number, AvailabilitySlot[]> = {};
    (data?.slots || []).forEach((slot: AvailabilitySlot) => {
      groups[slot.day_of_week] = [...(groups[slot.day_of_week] || []), slot];
    });
    return groups;
  }, [data]);

  const toggleSlot = (day: number, time: string) => {
    const exists = value.some((slot) => slot.day === String(day) && slot.time === time);
    if (exists) {
      onChange(value.filter((slot) => !(slot.day === String(day) && slot.time === time)));
    } else {
      onChange([...value.filter((slot) => slot.day || slot.time), { day: String(day), time }]);
    }
  };

  if (!teacherId) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
        Selecione um professor para carregar horários.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <CalendarDays className="h-4 w-4 text-primary" />
          Agenda recorrente
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Escolha somente horários livres dentro da disponibilidade do professor.
        </p>
      </div>

      <div className="divide-y divide-border">
        {DAYS.map((day) => {
          const dayAvailability = availabilityByDay[day.value] || [];
          const times = buildHalfHourSlots(dayAvailability);
          const nextDate = nextDateForWeekday(day.value);
          const nextDateKey = toLocalDateKey(nextDate);
          const dayBlocked = blocked.includes(nextDateKey);

          return (
            <div key={day.value} className="grid grid-cols-1 gap-3 p-4 md:grid-cols-[88px_1fr]">
              <div>
                <p className="text-sm font-semibold">{day.full}</p>
                <p className="text-xs text-muted-foreground">{times.length ? `${times.length} slots` : "Indisponível"}</p>
              </div>

              {isLoading ? (
                <div className="h-10 animate-pulse rounded-lg bg-muted" />
              ) : times.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
                  Sem expediente configurado.
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {times.map((time) => {
                    const recurringConflict = recurringBusy.find(
                      (slot) => slot.day_of_week === day.value && slotOverlaps(time, slot.start_time)
                    );
                    const busyAtTime = busy.some((date: string) => {
                      const busyDate = new Date(date);
                      return toLocalDateKey(busyDate) === nextDateKey && slotOverlaps(time, busyDate.toTimeString().slice(0, 5));
                    });
                    const disabled = dayBlocked || busyAtTime || !!recurringConflict;
                    const selected = value.some((slot) => slot.day === String(day.value) && slot.time === time);
                    return (
                      <button
                        key={time}
                        type="button"
                        disabled={disabled}
                        onClick={() => toggleSlot(day.value, time)}
                        className={cn(
                          "inline-flex min-w-[86px] items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition",
                          !disabled && "border-primary/20 bg-background hover:border-primary hover:bg-primary/5",
                          selected && "border-primary bg-primary text-primary-foreground hover:bg-primary",
                          disabled && "cursor-not-allowed border-border bg-muted text-muted-foreground opacity-70"
                        )}
                        title={
                          recurringConflict?.student_name
                            ? `Ocupado por ${recurringConflict.student_name}`
                            : disabled
                              ? "Horário ocupado ou bloqueado"
                              : "Selecionar horário recorrente"
                        }
                      >
                        <Clock className="h-3.5 w-3.5" />
                        {time}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});

RecurringSchedulePicker.displayName = "RecurringSchedulePicker";

export default RecurringSchedulePicker;
