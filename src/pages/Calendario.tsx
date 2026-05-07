import { useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import { ChevronLeft, ChevronRight, X, Clock, Calendar, Ban, AlertCircle, Settings, Lock, Unlock, PlayCircle } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { addDays, isPast, isToday, parseISO } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import TeacherAvailabilityModal from "./TeacherAvailabilityModal";
import ScheduleSlotPicker from "@/components/ScheduleSlotPicker";
import CreatableSelect from "react-select/creatable";

const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

// Map 0-6 JS weekday -> 0-6 Python weekday (Monday=0)
const jsToPyDay = (jsDay: number) => {
  if (jsDay === 0) return 6;
  return jsDay - 1;
};

const Calendario = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedLessons, setSelectedLessons] = useState<any[] | null>(null);
  const [selectedLesson, setSelectedLesson] = useState<any | null>(null);

  // Novo modo de reagendamento direto no calendário
  const [reschedulingLesson, setReschedulingLesson] = useState<any | null>(null);
  const [selectedRescheduleDate, setSelectedRescheduleDate] = useState<Date | null>(null);
  const [selectedRescheduleDateTime, setSelectedRescheduleDateTime] = useState("");
  const [startingLesson, setStartingLesson] = useState<any | null>(null);
  const [startingTemplateId, setStartingTemplateId] = useState("");
  const [isAvailabilityModalOpen, setIsAvailabilityModalOpen] = useState(false);
  const [selectedDayOptions, setSelectedDayOptions] = useState<Date | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data = [], isLoading } = useQuery({
    queryKey: ['lessons'],
    queryFn: async () => {
      const res = await api.get('/lessons/?all=true&is_template=false');
      return Array.isArray(res.data) ? res.data : (res.data.results || []);
    }
  });

  const lessons = Array.isArray(data) ? data : [];

  const { data: templateOptions = [] } = useQuery({
    queryKey: ["lesson-templates"],
    queryFn: async () => {
      const res = await api.get("/lessons/templates/");
      const templates = Array.isArray(res.data) ? res.data : (res.data.results || []);
      return templates
        .filter((lesson: any) => lesson.is_template)
        .map((lesson: any) => ({
          label: `[${lesson.level}] ${lesson.title}`,
          value: lesson.id,
          title: lesson.title,
          level: lesson.level,
        }));
    },
  });

  // Query Availability for selected lesson's teacher
  const teacherId = reschedulingLesson?.teacher;
  const { data: availabilityInfo } = useQuery({
    queryKey: ['teacher-availability', teacherId],
    queryFn: async () => {
      if (!teacherId) return null;
      const res = await api.get(`/teacher-availability/${teacherId}/`);
      return res.data;
    },
    enabled: !!teacherId,
  });

  const availableSlots = availabilityInfo?.slots || [];
  const busySlots = availabilityInfo?.busy || [];
  const teacherBlockedDates = availabilityInfo?.blocked || [];

  const { data: currentUserAvailability } = useQuery({
    queryKey: ['teacher-availability', user?.user_id],
    queryFn: async () => {
      if (user?.role !== 'teacher' && user?.role !== 'admin') return null;
      const res = await api.get(`/teacher-availability/${user.user_id}/`);
      return res.data;
    },
    enabled: user?.role === 'teacher' || user?.role === 'admin',
  });

  const myBlockedDates = currentUserAvailability?.blocked || [];

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const prev = () => setCurrentDate(new Date(year, month - 1, 1));
  const next = () => setCurrentDate(new Date(year, month + 1, 1));

  const getTimeSlots = (date: Date) => {
    const pyDay = jsToPyDay(date.getDay());
    const dayAvails = availableSlots.filter((av: any) => av.day_of_week === pyDay);
    let allPossible: string[] = [];

    dayAvails.forEach((av: any) => {
      const startHour = parseInt(av.start.split(':')[0]);
      const endHour = parseInt(av.end.split(':')[0]);
      for (let h = startHour; h < endHour; h++) {
        allPossible.push(`${String(h).padStart(2, '0')}:00`);
      }
    });

    const busyTimes = busySlots.map((b: string) => {
      const bDate = new Date(b);
      const isSameDay = bDate.getFullYear() === date.getFullYear() && bDate.getMonth() === date.getMonth() && bDate.getDate() === date.getDate();
      if (isSameDay) return `${String(bDate.getHours()).padStart(2, '0')}:00`;
      return null;
    }).filter(Boolean);

    const getLocalIsoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const localIsoStrDate = getLocalIsoDate(date);
    if (teacherBlockedDates.includes(localIsoStrDate)) return [];

    return allPossible.filter(time => !busyTimes.includes(time));
  };

  const blockDateMutation = useMutation({
    mutationFn: async (dateStr: string) => {
      return api.post('/blocked-dates/', { date: dateStr });
    },
    onSuccess: () => {
      toast({ title: 'Sucesso', description: 'Data bloqueada com sucesso!' });
      queryClient.invalidateQueries({ queryKey: ['teacher-availability'] });
      setSelectedDayOptions(null);
    }
  });

  const unblockDateMutation = useMutation({
    mutationFn: async (dateStr: string) => {
      return api.delete('/blocked-dates/unblock/', { data: { date: dateStr } });
    },
    onSuccess: () => {
      toast({ title: 'Sucesso', description: 'Data desbloqueada com sucesso!' });
      queryClient.invalidateQueries({ queryKey: ['teacher-availability'] });
      setSelectedDayOptions(null);
    }
  });

  const actionMutation = useMutation({
    mutationFn: async ({ id, action, payload }: { id: string; action: string; payload?: any }) => {
      if (action === "cancel") return api.patch(`/lessons/${id}/cancel_lesson/`);
      if (action === "miss") return api.patch(`/lessons/${id}/mark_missed/`);
      if (action === "reschedule") return api.patch(`/lessons/${id}/reschedule/`, payload);
      throw new Error("Ação inválida");
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['lessons'] });
      toast({
        title: "Sucesso!",
        description: variables.action === "cancel" ? "Aula cancelada." : variables.action === "miss" ? "Falta registrada." : "Aula reagendada."
      });
      setSelectedLesson(null);
      setReschedulingLesson(null);
      setSelectedRescheduleDate(null);
      setSelectedRescheduleDateTime("");
    },
    onError: (err: any) => {
      toast({
        title: "Erro na operação",
        description: err.response?.data?.error || "Não foi possível concluir a ação no calendário.",
        variant: "destructive"
      });
    }
  });

  const startLessonMutation = useMutation({
    mutationFn: async ({ lessonId, templateId }: { lessonId: string; templateId: string }) => {
      return api.patch(`/lessons/${lessonId}/start_lesson/`, { template: templateId });
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["lessons"] });
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      setStartingLesson(null);
      setStartingTemplateId("");
      setSelectedLesson(null);
      navigate(`/aulas/${res.data.id}/anotar?from=calendar`);
    },
    onError: (err: any) => {
      toast({
        title: "Erro ao iniciar aula",
        description: err.response?.data?.error || "Não foi possível iniciar a aula.",
        variant: "destructive",
      });
    },
  });

  const handleAction = (action: string) => {
    if (!selectedLesson) return;

    if (window.confirm(`Tem certeza que deseja ${action === "cancel" ? "cancelar esta aula?" : "marcar como falta?"}`)) {
      actionMutation.mutate({ id: selectedLesson.id, action });
    }
  };

  const getLessonsForDay = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return lessons.filter((l: any) => l.date && l.date.split("T")[0] === dateStr && l.status !== "pending");
  };

  const getLessonColor = (status: string) => {
    switch (status) {
      case 'completed': return "bg-success/10 text-success-foreground border-success/20";
      case 'in_progress': return "bg-blue-500/10 text-blue-700 border-blue-500/20";
      case 'scheduled': return "bg-primary/10 text-primary border-primary/20";
      case 'rescheduled': return "bg-warning/10 text-warning-foreground border-warning/30";
      case 'canceled': return "bg-destructive/10 text-destructive border-destructive/20";
      case 'missed': return "bg-purple-500/10 text-purple-700 border-purple-500/20";
      default: return "bg-muted text-muted-foreground border-border";
    }
  };

  const getLessonHoverColor = (status: string) => {
    switch (status) {
      case 'completed': return "hover:bg-success/20 hover:border-success/40";
      case 'in_progress': return "hover:bg-blue-500/20 hover:border-blue-500/40";
      case 'scheduled': return "hover:bg-primary/20 hover:border-primary/40";
      case 'rescheduled': return "hover:bg-warning/20 hover:border-warning/50";
      case 'canceled': return "hover:bg-destructive/20 hover:border-destructive/40";
      case 'missed': return "hover:bg-purple-500/20 hover:border-purple-500/40";
      default: return "hover:bg-muted/80";
    }
  };

  const formatTimeStr = (dateString: string) => {
    if (!dateString) return "";
    const d = new Date(dateString);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const completedCount = lessons.filter((l: any) => l.status === "completed").length;
  const upcomingCount = lessons.filter((l: any) => l.status === "scheduled" || l.status === "rescheduled" || l.status === "in_progress").length;
  const missedCount = lessons.filter((l: any) => l.status === "missed").length;

  const upcomingLessons = lessons
    .filter((l: any) => l.status === "scheduled" || l.status === "rescheduled")
    .map((l: any) => new Date(l.date))
    .sort((a: any, b: any) => a - b);

  let periodText = "Nenhuma aula pendente.";
  if (upcomingLessons.length === 1) {
    periodText = upcomingLessons[0].toLocaleDateString("pt-BR");
  } else if (upcomingLessons.length > 1) {
    const first = upcomingLessons[0].toLocaleDateString("pt-BR");
    const last = upcomingLessons[upcomingLessons.length - 1].toLocaleDateString("pt-BR");
    periodText = `${first} até ${last}`;
  }

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(<div key={`empty-${i}`} />);
  for (let day = 1; day <= daysInMonth; day++) {
    const dayLessons = getLessonsForDay(day);
    const cellDate = new Date(year, month, day);
    const todayZero = new Date();
    todayZero.setHours(0, 0, 0, 0);
    const isPastDate = cellDate < todayZero;
    const pyDay = jsToPyDay(cellDate.getDay());

    let isVerde = false;
    let isVermelho = false;
    const isoDateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const myIsBlocked = myBlockedDates.includes(isoDateStr);
    const teacherIsBlocked = teacherBlockedDates.includes(isoDateStr);

    if (reschedulingLesson) {
      if (!isPastDate) {
        const hasAvail = availableSlots.some((av: any) => av.day_of_week === pyDay);
        if (hasAvail && !teacherIsBlocked) isVerde = true;
        else isVermelho = true;
      }
    }

    let cellClasses = "relative p-2 min-h-[100px] xl:min-h-[140px] flex flex-col rounded-xl border border-border text-sm sidebar-transition overflow-hidden ";

    const isTodayCurrent = isToday(cellDate);

    if (reschedulingLesson) {
      if (isPastDate) cellClasses += "opacity-50 cursor-not-allowed bg-muted ";
      else if (isVerde) cellClasses += "bg-green-100/50 border-green-500 cursor-pointer hover:bg-green-200/60 text-green-900 shadow-sm ";
      else if (isVermelho) cellClasses += "bg-red-50/50 border-red-200 cursor-not-allowed text-red-500 opacity-70 ";
    } else {
      cellClasses += "cursor-pointer hover:bg-accent/50 focus:bg-accent text-card-foreground ";
      if (myIsBlocked && user?.role === 'teacher') {
        cellClasses += "bg-muted/50 border-dashed border-red-300 opacity-80 ";
      }
      if (isTodayCurrent) {
        cellClasses += "ring-2 ring-primary border-transparent ";
      }
    }

      const handleRescheduleSelect = (dateStr: string) => {
        const [year, month, day] = dateStr.split('-').map(Number);
        const dateObj = new Date(year, month - 1, day);

        setSelectedRescheduleDate(dateObj);
        setSelectedRescheduleDateTime("");
      };

    const handleCellClick = () => {
      if (reschedulingLesson) {
        if (!isPastDate && isVerde) {
          handleRescheduleSelect(isoDateStr);
        } else if (!isPastDate && isVermelho) {
          toast({ title: "Indisponível", description: "O professor não atende neste dia.", variant: "destructive" });
        } else {
          toast({ title: "Inválido", description: "Não é possível reagendar para o passado.", variant: "destructive" });
        }
      } else {
        if (user?.role === 'teacher') {
          setSelectedDayOptions(cellDate);
        } else {
          if (dayLessons.length === 1) {
            setSelectedLesson(dayLessons[0]);
          } else if (dayLessons.length > 1) {
            setSelectedLessons(dayLessons);
          }
        }
      }
    };

    cells.push(
      <div
        key={day}
        onClick={handleCellClick}
        className={cellClasses}
      >
        <span className={`font-medium flex justify-between items-center mb-1 ${isTodayCurrent ? 'text-primary font-bold' : 'text-muted-foreground'}`}>
          <span>{day}</span>
          {myIsBlocked && user?.role === 'teacher' && <Lock size={12} className="text-red-400" />}
        </span>

        {!reschedulingLesson && dayLessons.length > 0 && (
          <div className="flex flex-col gap-1 overflow-y-auto pr-1 flex-1 hide-scrollbar">
            {dayLessons.slice(0, 3).map((l: any) => (
              <div
                key={l.id}
                onClick={(e) => {
                  if (!reschedulingLesson) {
                    e.stopPropagation();
                    setSelectedLesson(l);
                  }
                }}
                className={`px-1.5 py-1 text-[10px] sm:text-[11px] rounded-md border flex items-center gap-1 cursor-pointer transition-colors ${getLessonColor(l.status)} ${getLessonHoverColor(l.status)}`}
              >
                <Clock size={10} className="shrink-0 opacity-70" />
                <span className="font-semibold">{formatTimeStr(l.date)}</span>
                <span className="truncate max-w-[80px] sm:max-w-full">
                  {user?.role === 'teacher' ? l.student_name : l.teacher_name}
                </span>
              </div>
            ))}
            {dayLessons.length > 3 && (
              <div
                className="text-[10px] font-medium text-center text-muted-foreground mt-0.5 hover:text-foreground cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedLessons(dayLessons);
                }}
              >
                + {dayLessons.length - 3} mais
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <PageHeader title="Calendário" description="Visualize suas aulas no calendário." />
        {user?.role === 'teacher' && (
          <button
            onClick={() => setIsAvailabilityModalOpen(true)}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-medium transition"
          >
            <Settings size={18} />
            Configurar Horários
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="border border-border rounded-xl p-4 bg-card shadow-sm">
          <p className="text-2xl font-bold text-foreground">{completedCount}</p>
          <p className="text-sm text-muted-foreground">Aulas concluídas</p>
        </div>
        <div className="border border-border rounded-xl p-4 bg-card shadow-sm">
          <p className="text-2xl font-bold text-foreground">{upcomingCount}</p>
          <p className="text-sm text-muted-foreground">Aulas restantes</p>
        </div>
        <div className="border border-border rounded-xl p-4 bg-card shadow-sm col-span-1 md:col-span-1">
          <p className="text-lg font-bold text-foreground mt-1 text-primary">{periodText}</p>
          <p className="text-sm text-muted-foreground mt-1">Período das Próximas Aulas</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 mb-6 px-2 text-xs font-medium text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-md bg-success/20 border border-success/30 shadow-sm" /> Concluída</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-md bg-blue-500/20 border border-blue-500/30 shadow-sm" /> Em andamento</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-md bg-primary/20 border border-primary/30 shadow-sm" /> Agendada</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-md bg-warning/20 border border-warning/30 shadow-sm" /> Reagendada</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-md bg-destructive/20 border border-destructive/30 shadow-sm" /> Cancelada</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-md bg-purple-500/20 border border-purple-500/30 shadow-sm" /> Falta</span>
      </div>

      {reschedulingLesson && (
        <div className="mb-6 p-4 bg-primary/10 border border-primary/20 rounded-xl flex items-center justify-between animate-fade-in">
          <div>
            <h3 className="font-semibold text-primary">Modo de Reagendamento Ativado</h3>
            <p className="text-sm text-primary/80 mt-1">Selecione um dia destacado em <span className="font-bold text-green-700">verde</span> no calendário para reagendar a aula <strong>{reschedulingLesson.title}</strong>.</p>
          </div>
          <button
            onClick={() => setReschedulingLesson(null)}
            className="px-4 py-2 bg-background border border-border rounded-lg text-sm hover:bg-muted font-medium"
          >
            Cancelar
          </button>
        </div>
      )}

      {isLoading ? <p>Carregando calendário...</p> : (
        <div className="border border-border rounded-xl bg-card p-6">
          <div className="flex items-center justify-between mb-6">
            <button onClick={prev} className="p-2 rounded-lg hover:bg-accent sidebar-transition"><ChevronLeft size={18} /></button>
            <h2 className="text-lg font-semibold text-card-foreground capitalize">
              {currentDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
            </h2>
            <button onClick={next} className="p-2 rounded-lg hover:bg-accent sidebar-transition"><ChevronRight size={18} /></button>
          </div>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {DAYS.map((d) => (
              <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">{cells}</div>
        </div>
      )}

      {selectedLessons && (
        <div className="fixed inset-0 bg-foreground/20 z-50 flex items-center justify-center p-4" onClick={() => setSelectedLessons(null)}>
          <div className="bg-card rounded-2xl shadow-lg p-6 max-w-md w-full animate-fade-in flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-semibold text-lg text-card-foreground">Aulas do Dia</h3>
                {selectedLessons.length > 0 && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {new Date(selectedLessons[0].date).toLocaleDateString("pt-BR", {
                      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                    })}
                  </p>
                )}
              </div>
              <button onClick={() => setSelectedLessons(null)} className="p-1 rounded-lg hover:bg-accent sidebar-transition">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-3">
              {selectedLessons.map(l => {
                const time = `${String(new Date(l.date).getHours()).padStart(2, '0')}:${String(new Date(l.date).getMinutes()).padStart(2, '0')}`;
                return (
                  <div
                    key={l.id}
                    className={`p-3 border rounded-xl cursor-pointer transition-all text-left flex items-center justify-between ${getLessonColor(l.status)} ${getLessonHoverColor(l.status)}`}
                    onClick={() => {
                      setSelectedLesson(l);
                      setSelectedLessons(null);
                    }}
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Clock size={14} className="opacity-70" />
                        <span className="font-semibold">{time}</span>
                      </div>
                      <p className="font-medium text-sm">{l.title}</p>
                      {user?.role === 'teacher' && l.student_name && (
                        <p className="text-xs opacity-80 mt-1">Aluno: {l.student_name}</p>
                      )}
                      {user?.role === 'student' && l.teacher_name && (
                        <p className="text-xs opacity-80 mt-1">Prof: {l.teacher_name}</p>
                      )}
                    </div>
                    <StatusBadge status={l.status} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {selectedLesson && (
        <div className="fixed inset-0 bg-foreground/20 z-50 flex items-center justify-center p-4" onClick={() => setSelectedLesson(null)}>
          <div className="bg-card rounded-2xl shadow-lg p-6 max-w-md w-full animate-fade-in flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-semibold text-lg text-card-foreground">{selectedLesson.title}</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {new Date(selectedLesson.date).toLocaleDateString("pt-BR", {
                    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                  })}
                </p>
                {user?.role === 'teacher' && selectedLesson.student_name && (
                  <p className="text-sm text-primary mt-1 font-medium">Aluno: {selectedLesson.student_name}</p>
                )}
                {user?.role === 'student' && selectedLesson.teacher_name && (
                  <p className="text-sm text-primary mt-1 font-medium">Professor: {selectedLesson.teacher_name}</p>
                )}
              </div>
              <button onClick={() => {
                setSelectedLesson(null);
              }} className="p-1 rounded-lg hover:bg-accent sidebar-transition">
                <X size={18} />
              </button>
            </div>

            <div className="flex items-center gap-2 mb-4">
              <StatusBadge status={selectedLesson.status} />
            </div>

            <div className="flex-1 overflow-y-auto pr-2">
              <div className="space-y-4">
                {selectedLesson.notes && (
                  <div className="bg-muted p-3 rounded-lg text-sm mb-4">
                    {selectedLesson.notes}
                  </div>
                )}

                {user?.role === 'teacher' && ['scheduled', 'rescheduled', 'in_progress'].includes(selectedLesson.status) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6">
                    <button
                      onClick={() => {
                        if (selectedLesson.status === 'in_progress') {
                          navigate(`/aulas/${selectedLesson.id}/anotar?from=calendar`);
                        } else {
                          setStartingLesson(selectedLesson);
                          setStartingTemplateId(selectedLesson.template || "");
                          setSelectedLesson(null);
                        }
                      }}
                      className="col-span-1 sm:col-span-2 flex items-center justify-center gap-2 w-full py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition"
                    >
                      <PlayCircle size={16} /> {selectedLesson.status === 'in_progress' ? 'Continuar Aula' : 'Iniciar Aula'}
                    </button>

                    {['scheduled', 'rescheduled'].includes(selectedLesson.status) && (
                      <>
                        <button
                          onClick={() => {
                            setReschedulingLesson(selectedLesson);
                            setSelectedLesson(null);
                          }}
                          className="flex items-center justify-center gap-2 w-full py-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg text-sm font-medium transition"
                        >
                          <Calendar size={16} /> Reagendar
                        </button>

                        <button
                          onClick={() => handleAction("cancel")}
                          className="flex items-center justify-center gap-2 w-full py-2 bg-destructive/10 hover:bg-destructive/20 text-destructive rounded-lg text-sm font-medium transition"
                        >
                          <Ban size={16} /> Cancelar Aula
                        </button>
                      </>
                    )}

                    {new Date() > new Date(selectedLesson.date) && (
                      <button
                        onClick={() => handleAction("miss")}
                        className="col-span-1 sm:col-span-2 flex items-center justify-center gap-2 w-full py-2 bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 rounded-lg text-sm font-medium transition mt-1"
                      >
                        <AlertCircle size={16} /> Marcar Falta
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedRescheduleDate && (
        <div className="fixed inset-0 bg-foreground/20 z-50 flex items-center justify-center p-4" onClick={() => {
          setSelectedRescheduleDate(null);
          setSelectedRescheduleDateTime("");
        }}>
          <div className="bg-card rounded-2xl shadow-lg p-6 max-w-[400px] w-full animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-2">
              <div>
                <h3 className="font-semibold text-lg">Horários Disponíveis</h3>
                <p className="text-sm text-muted-foreground capitalize">
                  {selectedRescheduleDate.toLocaleDateString("pt-BR", { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
              </div>
              <button onClick={() => {
                setSelectedRescheduleDate(null);
                setSelectedRescheduleDateTime("");
              }} className="p-1 rounded-lg hover:bg-accent sidebar-transition">
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 mt-6">
              <div className="col-span-3">
                <ScheduleSlotPicker
                  teacherId={reschedulingLesson?.teacher}
                  excludeLessonId={reschedulingLesson?.id}
                  value={selectedRescheduleDateTime || selectedRescheduleDate.toISOString()}
                  onChange={setSelectedRescheduleDateTime}
                />
              </div>
            </div>

            <button
              disabled={!selectedRescheduleDateTime || actionMutation.isPending}
              onClick={() => {
                actionMutation.mutate({
                  id: reschedulingLesson.id,
                  action: "reschedule",
                  payload: { date: selectedRescheduleDateTime }
                });
              }}
              className="mt-4 w-full py-3 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {actionMutation.isPending ? "Reagendando..." : "Confirmar Reagendamento"}
            </button>
          </div>
        </div>
      )}

      {startingLesson && (
        <div className="fixed inset-0 bg-foreground/20 z-50 flex items-center justify-center p-4" onClick={() => setStartingLesson(null)}>
          <div className="bg-card rounded-2xl shadow-lg p-6 max-w-md w-full animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-5">
              <div>
                <h3 className="font-semibold text-lg text-card-foreground">Iniciar Aula</h3>
                <p className="text-sm text-muted-foreground mt-1">Confirme o template desta aula.</p>
              </div>
              <button
                onClick={() => {
                  setStartingLesson(null);
                  setStartingTemplateId("");
                }}
                className="p-1 rounded-lg hover:bg-accent sidebar-transition"
              >
                <X size={18} />
              </button>
            </div>

            <div className="rounded-lg border border-border bg-muted p-3 text-sm mb-4">
              <p className="font-medium">{startingLesson.student_name}</p>
              <p className="text-muted-foreground">
                {new Date(startingLesson.date).toLocaleDateString("pt-BR", {
                  weekday: "long",
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>

            <label className="block text-sm font-medium mb-1">Título da Aula</label>
            <CreatableSelect
              options={templateOptions}
              placeholder="Pesquise a aula..."
              isClearable
              isValidNewOption={() => false}
              value={templateOptions.find((option: any) => option.value === startingTemplateId) || null}
              onChange={(option: any) => setStartingTemplateId(option?.value || "")}
              styles={{
                control: (baseStyles) => ({
                  ...baseStyles,
                  backgroundColor: 'hsl(var(--background))',
                  borderColor: 'hsl(var(--border))',
                  padding: '2px'
                }),
                menu: (baseStyles) => ({
                  ...baseStyles,
                  backgroundColor: 'hsl(var(--card))',
                }),
                option: (baseStyles, state) => ({
                  ...baseStyles,
                  backgroundColor: state.isFocused ? 'hsl(var(--accent))' : 'transparent',
                  color: 'hsl(var(--foreground))',
                  cursor: 'pointer',
                }),
                singleValue: (baseStyles) => ({
                  ...baseStyles,
                  color: 'hsl(var(--foreground))',
                }),
                input: (baseStyles) => ({
                  ...baseStyles,
                  color: 'hsl(var(--foreground))',
                })
              }}
            />

            <button
              disabled={!startingTemplateId || startLessonMutation.isPending}
              onClick={() => startLessonMutation.mutate({ lessonId: startingLesson.id, templateId: startingTemplateId })}
              className="mt-5 w-full py-3 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {startLessonMutation.isPending ? "Iniciando..." : "Iniciar Aula"}
            </button>
          </div>
        </div>
      )}

      {selectedDayOptions && user?.role === 'teacher' && (
        <div className="fixed inset-0 bg-foreground/20 z-50 flex items-center justify-center p-4" onClick={() => setSelectedDayOptions(null)}>
          <div className="bg-card rounded-2xl shadow-lg p-6 max-w-sm w-full animate-fade-in flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-semibold text-lg text-card-foreground">Ações do Dia</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {selectedDayOptions.toLocaleDateString("pt-BR", { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
              </div>
              <button onClick={() => setSelectedDayOptions(null)} className="p-1 rounded-lg hover:bg-accent sidebar-transition">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 mt-2">
              <button
                onClick={() => {
                  const dayLessons = getLessonsForDay(selectedDayOptions.getDate());
                  if (dayLessons.length === 1) setSelectedLesson(dayLessons[0]);
                  else if (dayLessons.length > 1) setSelectedLessons(dayLessons);
                  else toast({ title: "Aviso", description: "Nenhuma aula agendada para este dia." });
                  if (dayLessons.length > 0) setSelectedDayOptions(null);
                }}
                className="flex items-center gap-3 w-full p-3 rounded-lg border border-border hover:bg-accent transition-colors text-left"
              >
                <div className="bg-primary/10 p-2 rounded-lg text-primary">
                  <Calendar size={18} />
                </div>
                <div>
                  <p className="font-medium text-sm">Visualizar Aulas</p>
                  <p className="text-xs text-muted-foreground">Ver agenda deste dia</p>
                </div>
              </button>

              {(() => {
                const getLocalIsoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                const localIsoDate = getLocalIsoDate(selectedDayOptions);
                const isBlocked = myBlockedDates.includes(localIsoDate);
                if (isBlocked) {
                  return (
                    <button
                      onClick={() => unblockDateMutation.mutate(localIsoDate)}
                      disabled={unblockDateMutation.isPending}
                      className="flex items-center gap-3 w-full p-3 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 transition-colors text-left"
                    >
                      <div className="bg-red-100 p-2 rounded-lg text-red-600">
                        <Unlock size={18} />
                      </div>
                      <div>
                        <p className="font-medium text-sm text-red-900">Desbloquear Dia</p>
                        <p className="text-xs text-red-700/80">Permitir alunos agendarem</p>
                      </div>
                    </button>
                  );
                } else {
                  return (
                    <button
                      onClick={() => blockDateMutation.mutate(localIsoDate)}
                      disabled={blockDateMutation.isPending}
                      className="flex items-center gap-3 w-full p-3 rounded-lg border border-border hover:bg-accent transition-colors text-left"
                    >
                      <div className="bg-muted p-2 rounded-lg text-muted-foreground">
                        <Lock size={18} />
                      </div>
                      <div>
                        <p className="font-medium text-sm">Bloquear Dia</p>
                        <p className="text-xs text-muted-foreground">Impedir novos agendamentos</p>
                      </div>
                    </button>
                  );
                }
              })()}
            </div>
          </div>
        </div>
      )}

      {isAvailabilityModalOpen && (
        <TeacherAvailabilityModal onClose={() => setIsAvailabilityModalOpen(false)} />
      )}
    </DashboardLayout>
  );
};
export default Calendario;
