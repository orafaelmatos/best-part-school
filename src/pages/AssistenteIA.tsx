import { useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import PageHeader from "@/components/PageHeader";
import AudioPlayer from "@/components/AudioPlayer";
import LessonContextSelector from "@/components/LessonContextSelector";
import MicRecorder, { RecordingState } from "@/components/MicRecorder";
import PronunciationFeedback, { SpeakingFeedback } from "@/components/PronunciationFeedback";
import { ArrowLeft, BookOpen, Brain, Loader2, MessageSquare, Send } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

type StudyMode = "speaking" | "listening" | "writing" | "weak_points";
type Theme = "travel" | "work" | "interview" | "casual" | "restaurant" | "airport" | "business" | "minhas_aulas";

type AIMessage = {
  id: string;
  role: "system" | "user" | "assistant";
  content_type: "text" | "audio" | "feedback";
  text: string;
  audio_url?: string | null;
  feedback_detail?: SpeakingFeedback | null;
  created_at?: string;
  pending?: boolean;
};

type ContextLesson = {
  lesson: string;
};

type Session = {
  id: string;
  mode: StudyMode;
  theme: Theme;
  context_lessons?: ContextLesson[];
  messages?: AIMessage[];
};

const studyModes: { value: StudyMode; label: string; description: string }[] = [
  { value: "speaking", label: "Speaking", description: "Grave respostas e receba análise de pronúncia." },
  { value: "listening", label: "Listening", description: "Pratique compreensão com respostas curtas." },
  { value: "writing", label: "Writing", description: "Treine estrutura, clareza e vocabulário." },
  { value: "weak_points", label: "Estudar pontos fracos", description: "Use automaticamente erros, vocabulário difícil e tarefas pendentes." },
];

const themes: { value: Theme; label: string }[] = [
  { value: "travel", label: "Travel" },
  { value: "work", label: "Work" },
  { value: "interview", label: "Interview" },
  { value: "casual", label: "Casual conversation" },
  { value: "restaurant", label: "Restaurant" },
  { value: "airport", label: "Airport" },
  { value: "business", label: "Business English" },
  { value: "minhas_aulas", label: "Minhas Aulas" },
];

const absoluteMediaUrl = (url?: string | null) => {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  return `http://localhost:8000${url}`;
};

const nowLabel = () => new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

const AssistenteIA = () => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [mode, setMode] = useState<StudyMode | null>(null);
  const [theme, setTheme] = useState<Theme | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [input, setInput] = useState("");
  const [selectedLessonIds, setSelectedLessonIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [contextSaving, setContextSaving] = useState(false);
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const { toast } = useToast();

  const headerDescription = useMemo(() => {
    if (!mode || !theme) return "Escolha como quer praticar seu inglês.";
    return `${studyModes.find((item) => item.value === mode)?.label} · ${themes.find((item) => item.value === theme)?.label}`;
  }, [mode, theme]);

  const hasUnsavedContext = useMemo(() => {
    const savedIds = (session?.context_lessons || []).map((item) => item.lesson).sort().join(",");
    const selectedIds = [...selectedLessonIds].sort().join(",");
    return savedIds !== selectedIds;
  }, [selectedLessonIds, session]);

  const handleSelectMode = (selectedMode: StudyMode) => {
    setMode(selectedMode);
    setStep(2);
  };

  const startSession = async (selectedTheme: Theme) => {
    if (!mode) return;
    setTheme(selectedTheme);
    setStep(3);
    setIsLoading(true);
    setMessages([]);
    try {
      const response = await api.post("/ai-study/sessions/", {
        mode,
        theme: selectedTheme,
      });
      setSession(response.data);
      setSelectedLessonIds((response.data.context_lessons || []).map((item: ContextLesson) => item.lesson));
      setMessages(response.data.messages?.length ? response.data.messages : [{
        id: "initial",
        role: "assistant",
        content_type: "text",
        text: "Hi! I'm ready to practice with you. Select previous lessons for context or start speaking when you're ready.",
      }]);
    } catch {
      toast({
        title: "Erro ao criar sessão",
        description: "Não foi possível iniciar o AI Study.",
        variant: "destructive",
      });
      setStep(2);
    } finally {
      setIsLoading(false);
    }
  };

  const syncSelectedContext = async ({ showSuccessToast = false }: { showSuccessToast?: boolean } = {}) => {
    if (!session) return;
    if (!hasUnsavedContext) {
      if (showSuccessToast) {
        toast({ title: "Contexto atualizado", description: "As aulas selecionadas já estão sincronizadas com a IA." });
      }
      return session;
    }
    setContextSaving(true);
    try {
      const response = await api.post(`/ai-study/sessions/${session.id}/contexts/`, {
        lesson_ids: selectedLessonIds,
      });
      setSession(response.data);
      if (showSuccessToast) {
        toast({ title: "Contexto atualizado", description: "As aulas selecionadas serão usadas pela IA." });
      }
      return response.data;
    } catch {
      toast({
        title: "Erro ao salvar contexto",
        description: "Não foi possível sincronizar as aulas selecionadas com a IA.",
        variant: "destructive",
      });
      return null;
    } finally {
      setContextSaving(false);
    }
  };

  const saveContext = async () => {
    await syncSelectedContext({ showSuccessToast: true });
  };

  const sendText = async () => {
    if (!input.trim() || !session || isLoading) return;
    const syncedSession = await syncSelectedContext();
    if (!syncedSession) return;
    const text = input.trim();
    const optimistic: AIMessage = {
      id: `local-${Date.now()}`,
      role: "user",
      content_type: "text",
      text,
      pending: true,
    };
    setMessages((current) => [...current, optimistic]);
    setInput("");
    setIsLoading(true);
    try {
      const response = await api.post(`/ai-study/sessions/${syncedSession.id}/message/`, { text });
      setMessages((current) => [
        ...current.filter((message) => message.id !== optimistic.id),
        { ...optimistic, pending: false },
        response.data,
      ]);
    } catch {
      setMessages((current) => current.filter((message) => message.id !== optimistic.id));
      toast({
        title: "Erro ao enviar mensagem",
        description: "Não foi possível conectar com a IA.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const uploadAudio = async (blob: Blob, durationSeconds: number) => {
    if (!session) return;
    const syncedSession = await syncSelectedContext();
    if (!syncedSession) return;
    setRecordingState("uploading");
    setIsLoading(true);
    const optimistic: AIMessage = {
      id: `audio-${Date.now()}`,
      role: "user",
      content_type: "audio",
      text: "Audio response sent for analysis.",
      pending: true,
    };
    setMessages((current) => [...current, optimistic]);
    try {
      const formData = new FormData();
      const extension = blob.type.includes("wav") ? "wav" : "webm";
      formData.append("audio", blob, `speaking-${Date.now()}.${extension}`);
      formData.append("duration_seconds", String(durationSeconds));
      const response = await api.post(`/ai-study/sessions/${syncedSession.id}/audio/`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setMessages((current) => [
        ...current.filter((message) => message.id !== optimistic.id),
        {
          ...optimistic,
          text: response.data.feedback?.transcript || optimistic.text,
          pending: false,
        },
        response.data.message,
      ].filter(Boolean));
      setRecordingState("completed");
    } catch {
      setMessages((current) => current.filter((message) => message.id !== optimistic.id));
      setRecordingState("error");
      toast({
        title: "Erro ao analisar áudio",
        description: "Verifique o microfone e tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const back = () => {
    if (step === 3) setStep(2);
    else if (step === 2) setStep(1);
  };

  return (
    <DashboardLayout>
      {step < 3 && <PageHeader title="AI Study" description="Pratique inglês com contexto das suas aulas e análise de fala." />}

      {step > 1 && step < 3 && (
        <button onClick={back} className="mb-6 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground sidebar-transition">
          <ArrowLeft size={16} /> Voltar
        </button>
      )}

      {step === 1 && (
        <div className="grid max-w-5xl grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {studyModes.map((item) => (
            <button
              key={item.value}
              onClick={() => handleSelectMode(item.value)}
              className="rounded-xl border border-border bg-card p-6 text-left sidebar-transition hover:border-foreground/20 hover:shadow-sm"
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                {item.value === "weak_points" ? <Brain size={18} /> : <MessageSquare size={18} />}
              </div>
              <p className="font-semibold text-card-foreground">{item.label}</p>
              <p className="mt-2 text-sm text-muted-foreground">{item.description}</p>
            </button>
          ))}
        </div>
      )}

      {step === 2 && (
        <div className="grid max-w-5xl grid-cols-2 gap-4 md:grid-cols-4">
          {themes.map((item) => (
            <button
              key={item.value}
              onClick={() => startSession(item.value)}
              className="rounded-xl border border-border bg-card p-6 text-center sidebar-transition hover:border-foreground/20 hover:shadow-sm"
            >
              <BookOpen className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
              <span className="text-sm font-medium text-card-foreground">{item.label}</span>
            </button>
          ))}
        </div>
      )}

      {step === 3 && (
        <div className="flex min-h-[calc(100vh-4rem)] flex-col">
          <div className="mb-4 flex flex-col gap-3 border-b border-border pb-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <button onClick={back} className="rounded-lg p-2 hover:bg-accent sidebar-transition">
                <ArrowLeft size={18} />
              </button>
              <div>
                <h2 className="font-semibold text-foreground">AI Study</h2>
                <p className="text-xs text-muted-foreground">{headerDescription}</p>
              </div>
            </div>
            {isLoading && <span className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Pensando...</span>}
          </div>

          <div className="grid flex-1 gap-5 lg:grid-cols-[320px_1fr]">
            <LessonContextSelector
              selectedIds={selectedLessonIds}
              onChange={setSelectedLessonIds}
              onSave={saveContext}
              disabled={contextSaving || !session}
            />

            <section className="flex min-h-[640px] flex-col rounded-2xl border border-border bg-card">
              <div className="flex-1 space-y-4 overflow-y-auto p-4">
                {messages.map((message) => (
                  <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed md:max-w-[72%] ${
                      message.role === "user"
                        ? "rounded-br-md bg-primary text-primary-foreground"
                        : "rounded-bl-md bg-secondary text-secondary-foreground"
                    }`}>
                      {message.audio_url && <AudioPlayer src={absoluteMediaUrl(message.audio_url)} compact />}
                      <p className="whitespace-pre-line">{message.text}</p>
                      {message.feedback_detail && (
                        <div className="mt-3 text-card-foreground">
                          <PronunciationFeedback feedback={message.feedback_detail} />
                        </div>
                      )}
                      <p className={`mt-2 text-[10px] ${message.role === "user" ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                        {message.pending ? "Enviando..." : message.created_at ? new Date(message.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : nowLabel()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-border p-4">
                {(mode === "speaking" || mode === "weak_points") && (
                  <div className="mb-4">
                    <MicRecorder
                      state={recordingState}
                      onStateChange={setRecordingState}
                      onRecordingComplete={uploadAudio}
                      disabled={!session || isLoading}
                    />
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={(event) => event.key === "Enter" && !isLoading && sendText()}
                    placeholder="Type your message..."
                    disabled={isLoading || !session}
                    className="flex-1 rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                  />
                  <button
                    onClick={sendText}
                    disabled={isLoading || !input.trim() || !session}
                    className="flex min-w-[44px] items-center justify-center rounded-xl bg-primary p-3 text-primary-foreground sidebar-transition hover:opacity-90 disabled:opacity-50"
                  >
                    {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                  </button>
                </div>
              </div>
            </section>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
};

export default AssistenteIA;
