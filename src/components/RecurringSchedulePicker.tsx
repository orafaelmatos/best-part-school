import { memo, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Clock } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type RecurringSlot = { day: string; time: string };
type AvailabilitySlot = { day_of_week: number; start: string; end: string };
type RecurringBusySlot = { id?: string; day_of_week: number; start_time: string; student_name?: string };
type SlotOption = {
  time: string;
  selected: boolean;
  disabled: boolean;
  title: string;
};
type DayOption = {
  value: number;
  label: string;
  full: string;
  nextDateLabel: string;
  slotOptions: SlotOption[];
  availableCount: number;
  statusLabel: string;
  hasSchedule: boolean;
};

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

const formatShortDate = (date: Date) =>
  date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });

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

type RecurringSchedulePickerProps = {
  teacherId?: string;
  value: RecurringSlot[];
  onChange: (slots: RecurringSlot[]) => void;
  selectionMode?: "multiple" | "single";
  excludedRecurringScheduleIds?: string[];
};

const RecurringSchedulePicker = memo(({
  teacherId,
  value,
  onChange,
  selectionMode = "multiple",
  excludedRecurringScheduleIds = [],
}: RecurringSchedulePickerProps) => {
  const [focusedDay, setFocusedDay] = useState<number | null>(null);

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
  const excludedRecurringScheduleIdsSet = useMemo(
    () => new Set(excludedRecurringScheduleIds),
    [excludedRecurringScheduleIds],
  );

  const availabilityByDay = useMemo(() => {
    const groups: Record<number, AvailabilitySlot[]> = {};
    (data?.slots || []).forEach((slot: AvailabilitySlot) => {
      groups[slot.day_of_week] = [...(groups[slot.day_of_week] || []), slot];
    });
    return groups;
  }, [data]);

  const dayOptions = useMemo<DayOption[]>(() => {
    return DAYS.map((day) => {
      const dayAvailability = availabilityByDay[day.value] || [];
      const times = buildHalfHourSlots(dayAvailability);
      const nextDate = nextDateForWeekday(day.value);
      const nextDateKey = toLocalDateKey(nextDate);
      const dayBlocked = blocked.includes(nextDateKey);

      const slotOptions = times.map((time) => {
        const selected = value.some((slot) => slot.day === String(day.value) && slot.time === time);
        const recurringConflict = recurringBusy.find(
          (slot) =>
            slot.day_of_week === day.value &&
            slotOverlaps(time, slot.start_time) &&
            !excludedRecurringScheduleIdsSet.has(slot.id || ""),
        );
        const busyAtTime = busy.some((date: string) => {
          const busyDate = new Date(date);
          return toLocalDateKey(busyDate) === nextDateKey && slotOverlaps(time, busyDate.toTimeString().slice(0, 5));
        });
        const disabled = !selected && (dayBlocked || busyAtTime || !!recurringConflict);

        return {
          time,
          selected,
          disabled,
          title: recurringConflict?.student_name
            ? `Ocupado por ${recurringConflict.student_name}`
            : disabled
              ? "Horário ocupado ou bloqueado"
              : "Selecionar horário recorrente",
        };
      });

      const availableCount = slotOptions.filter((slot) => !slot.disabled || slot.selected).length;

      return {
        ...day,
        nextDateLabel: formatShortDate(nextDate),
        slotOptions,
        availableCount,
        statusLabel: dayBlocked
          ? "Dia bloqueado"
          : !slotOptions.length
            ? "Sem expediente"
            : availableCount > 0
              ? `${availableCount} livres`
              : "Sem vagas",
        hasSchedule: slotOptions.length > 0,
      };
    });
  }, [availabilityByDay, blocked, busy, excludedRecurringScheduleIdsSet, recurringBusy, value]);

  const toggleSlot = (day: number, time: string) => {
    const exists = value.some((slot) => slot.day === String(day) && slot.time === time);
    if (exists) {
      onChange(value.filter((slot) => !(slot.day === String(day) && slot.time === time)));
    } else if (selectionMode === "single") {
      onChange([{ day: String(day), time }]);
    } else {
      onChange([...value.filter((slot) => slot.day || slot.time), { day: String(day), time }]);
    }
  };

  useEffect(() => {
    if (selectionMode !== "single") return;
    const valueDay = value[0]?.day ? Number(value[0].day) : null;
    if (valueDay !== null && !Number.isNaN(valueDay)) {
      setFocusedDay(valueDay);
    }
  }, [selectionMode, value]);

  useEffect(() => {
    if (selectionMode !== "single") return;
    if (value.length > 0 || focusedDay !== null) return;
    const fallbackDay = dayOptions.find((day) => day.hasSchedule)?.value;
    if (fallbackDay !== undefined) {
      setFocusedDay(fallbackDay);
    }
  }, [dayOptions, focusedDay, selectionMode, value.length]);

  if (!teacherId) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
        Selecione um professor para carregar horários.
      </div>
    );
  }

  const activeDay = dayOptions.find((day) => day.value === focusedDay) || dayOptions.find((day) => day.hasSchedule);

  if (selectionMode === "single") {
    return (
      <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50/90 px-5 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <CalendarDays className="h-4 w-4 text-primary" />
                Novo horário disponível
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Escolha primeiro o novo dia e depois o horário livre dentro da agenda do professor.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Livre
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-900/10 bg-slate-900 px-3 py-1 text-white">
                <span className="h-2 w-2 rounded-full bg-white" />
                Selecionado
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-500">
                <span className="h-2 w-2 rounded-full bg-slate-300" />
                Indisponível
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-5 p-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {dayOptions.map((day) => {
              const active = activeDay?.value === day.value;
              return (
                <button
                  key={day.value}
                  type="button"
                  onClick={() => day.hasSchedule && setFocusedDay(day.value)}
                  disabled={!day.hasSchedule}
                  className={cn(
                    "rounded-[22px] border p-4 text-left transition-all",
                    active && "border-slate-900 bg-slate-900 text-white shadow-lg shadow-slate-900/10",
                    !active && day.hasSchedule && "border-slate-200 bg-white hover:border-slate-400 hover:bg-slate-50",
                    !day.hasSchedule && "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400 opacity-80",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className={cn("text-sm font-semibold", active ? "text-white" : "text-slate-900")}>{day.full}</p>
                      <p className={cn("mt-1 text-xs", active ? "text-white/70" : "text-slate-500")}>
                        Próxima data: {day.nextDateLabel}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 text-[11px] font-medium",
                        active && "bg-white/12 text-white",
                        !active && day.availableCount > 0 && "bg-emerald-50 text-emerald-700",
                        !active && day.availableCount === 0 && "bg-slate-100 text-slate-500",
                      )}
                    >
                      {day.statusLabel}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-4">
            {!activeDay ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
                Nenhum dia com disponibilidade configurada.
              </div>
            ) : !activeDay.slotOptions.length ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
                Esse dia não possui horários configurados.
              </div>
            ) : (
              <>
                <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-base font-semibold text-slate-900">{activeDay.full}</p>
                    <p className="text-sm text-slate-500">
                      {activeDay.availableCount > 0
                        ? "Escolha um horário livre para concluir a troca."
                        : "Todos os slots desse dia estão ocupados no momento."}
                    </p>
                  </div>
                  <span className="inline-flex w-fit items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                    {activeDay.statusLabel}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                  {activeDay.slotOptions.map((slot) => (
                    <button
                      key={`${activeDay.value}-${slot.time}`}
                      type="button"
                      disabled={slot.disabled}
                      onClick={() => toggleSlot(activeDay.value, slot.time)}
                      className={cn(
                        "flex min-h-[52px] items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-all",
                        "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
                        slot.selected && "border-slate-900 bg-slate-900 text-white shadow-md shadow-slate-900/10",
                        !slot.selected && !slot.disabled && "border-slate-200 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50",
                        slot.disabled && "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400",
                      )}
                      title={slot.title}
                    >
                      <Clock className="h-3.5 w-3.5" />
                      {slot.time}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-slate-50/90 px-5 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <CalendarDays className="h-4 w-4 text-primary" />
              Agenda recorrente
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Escolha somente horários livres dentro da disponibilidade do professor.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Livre
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-900/10 bg-slate-900 px-3 py-1 text-white">
              <span className="h-2 w-2 rounded-full bg-white" />
              Selecionado
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-500">
              <span className="h-2 w-2 rounded-full bg-slate-300" />
              Indisponível
            </span>
          </div>
        </div>
      </div>

      <div className="max-h-[540px] overflow-y-auto p-4">
        <div className="space-y-3">
          {dayOptions.map((day) => (
            <div key={day.value} className="grid grid-cols-1 gap-3 rounded-[22px] border border-slate-200 bg-slate-50/70 p-4 md:grid-cols-[110px_1fr]">
              <div>
                <p className="text-sm font-semibold text-slate-900">{day.full}</p>
                <p className="mt-1 text-xs text-slate-500">{day.statusLabel}</p>
              </div>

              {isLoading ? (
                <div className="h-10 animate-pulse rounded-lg bg-muted" />
              ) : !day.slotOptions.length ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-white p-3 text-sm text-slate-500">
                  Sem expediente configurado.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                  {day.slotOptions.map((slot) => (
                    <button
                      key={`${day.value}-${slot.time}`}
                      type="button"
                      disabled={slot.disabled}
                      onClick={() => toggleSlot(day.value, slot.time)}
                      className={cn(
                        "flex min-h-[48px] items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition",
                        !slot.disabled && !slot.selected && "border-slate-200 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50",
                        slot.selected && "border-slate-900 bg-slate-900 text-white hover:bg-slate-900",
                        slot.disabled && "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400",
                      )}
                      title={slot.title}
                    >
                      <Clock className="h-3.5 w-3.5" />
                      {slot.time}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

RecurringSchedulePicker.displayName = "RecurringSchedulePicker";

export default RecurringSchedulePicker;
