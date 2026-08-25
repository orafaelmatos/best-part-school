import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Flag, Flame, Gamepad2, Heart, Play, RotateCcw, Shield, Sparkles, Star, Trophy } from "lucide-react";
import { Link } from "react-router-dom";

import DashboardLayout from "@/components/DashboardLayout";
import type { ReviewRating, VocabularyCard } from "@/components/FlashcardReview";
import PageHeader from "@/components/PageHeader";
import VocabularyAudioButton from "@/components/VocabularyAudioButton";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { APP_PATHS } from "@/lib/routes";
import {
  buildVocabularyGameRun,
  GAME_HEARTS,
  getVocabularyCategory,
  resolveGameRating,
  type VocabularyGameMode,
  type VocabularyGameRun,
  type VocabularyGameStage,
} from "@/lib/vocabularyGame";
import { cn } from "@/lib/utils";

type VocabularyStats = {
  due_today: number;
  overdue: number;
  mastered: number;
  difficult: number;
  study_streak: number;
  review_accuracy: number;
  total_learned_words: number;
  reviewed_30_days: number;
};

type ResolutionState = {
  selectedOptionId: string;
  isCorrect: boolean;
  pointsEarned: number;
  rating: ReviewRating;
  remainingHearts: number;
  usedHint: boolean;
};

const normalizeList = <T,>(data: unknown): T[] => {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object" && "results" in data) {
    const results = (data as { results?: unknown }).results;
    if (Array.isArray(results)) return results as T[];
  }
  return [];
};

const MODE_OPTIONS: Array<{ value: VocabularyGameMode; label: string; description: string }> = [
  { value: "review", label: "Revisar hoje", description: "Prioriza palavras vencidas, novas e esquecidas." },
  { value: "difficult", label: "Foco nas dificeis", description: "Puxa primeiro as palavras com menor confianca." },
  { value: "mixed", label: "Mistura inteligente", description: "Mescla revisao, consolidacao e manutencao." },
];

const PIXEL_FONT_STYLE = {
  fontFamily: '"Press Start 2P","VT323",monospace',
};

const WORLD_TONE_CLASSES = {
  sky: {
    badge: "border-sky-200/60 bg-sky-100/70 text-sky-800",
    panel: "border-sky-200/55 bg-sky-50/75",
  },
  emerald: {
    badge: "border-emerald-200/60 bg-emerald-100/70 text-emerald-800",
    panel: "border-emerald-200/55 bg-emerald-50/75",
  },
  amber: {
    badge: "border-amber-200/70 bg-amber-100/75 text-amber-800",
    panel: "border-amber-200/60 bg-amber-50/80",
  },
} as const;

const JogoVocabulario = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  const [mode, setMode] = useState<VocabularyGameMode>("review");
  const [activeRun, setActiveRun] = useState<VocabularyGameRun | null>(null);
  const [currentStageIndex, setCurrentStageIndex] = useState(0);
  const [hearts, setHearts] = useState(GAME_HEARTS);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [resolution, setResolution] = useState<ResolutionState | null>(null);
  const [finishedReason, setFinishedReason] = useState<"cleared" | "out_of_hearts" | null>(null);

  const { data: stats } = useQuery({
    queryKey: ["vocabulary-dashboard"],
    queryFn: async () => {
      const response = await api.get("/vocabulary-cards/dashboard/");
      return response.data as VocabularyStats;
    },
    enabled: user?.role === "student",
    refetchInterval: 60_000,
  });

  const { data: cards = [], isLoading } = useQuery({
    queryKey: ["vocabulary-cards"],
    queryFn: async () => {
      const response = await api.get("/vocabulary-cards/?ordering=next_review_at");
      return normalizeList<VocabularyCard>(response.data);
    },
    enabled: user?.role === "student",
    refetchInterval: 60_000,
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ cardId, rating }: { cardId: string; rating: ReviewRating }) =>
      api.post(`/vocabulary-cards/${cardId}/review/`, { rating }),
    onError: () => {
      toast({
        title: "Nao foi possivel salvar a rodada",
        description: "A resposta do jogo nao foi sincronizada com a revisao. Tente novamente na proxima fase.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["vocabulary-cards"] });
      queryClient.invalidateQueries({ queryKey: ["vocabulary-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["sidebar-badges"] });
    },
  });

  const playableCards = useMemo(() => cards.filter((card) => !card.archived), [cards]);
  const previewRun = useMemo(() => buildVocabularyGameRun(playableCards, mode), [mode, playableCards]);

  const currentStage = activeRun?.stages[currentStageIndex] || null;
  const runProgress = activeRun ? Math.round(((currentStageIndex + (resolution ? 1 : 0)) / activeRun.totalStages) * 100) : 0;
  const isRunActive = Boolean(activeRun) && !finishedReason;
  const isFinished = Boolean(finishedReason);
  const heroName = user?.name?.trim().split(/\s+/)[0] || "Hero";
  const missedAnswers = activeRun ? activeRun.totalStages - correctAnswers : 0;

  const resetSessionState = () => {
    setCurrentStageIndex(0);
    setHearts(GAME_HEARTS);
    setScore(0);
    setStreak(0);
    setBestStreak(0);
    setCorrectAnswers(0);
    setShowHint(false);
    setResolution(null);
    setFinishedReason(null);
  };

  const openPreview = (nextMode: VocabularyGameMode) => {
    setMode(nextMode);
    setActiveRun(null);
    resetSessionState();
  };

  const startRun = (selectedMode = mode) => {
    const run = buildVocabularyGameRun(playableCards, selectedMode);
    setMode(selectedMode);
    setActiveRun(run);
    resetSessionState();
    setHearts(run.hearts);
  };

  const finishRun = (reason: "cleared" | "out_of_hearts") => {
    setFinishedReason(reason);
    setResolution(null);
    setShowHint(false);
  };

  const goToNextStage = () => {
    if (!activeRun || !resolution) return;

    const isLastStage = currentStageIndex >= activeRun.totalStages - 1;
    if (resolution.remainingHearts <= 0) {
      finishRun("out_of_hearts");
      return;
    }
    if (isLastStage) {
      finishRun("cleared");
      return;
    }

    setCurrentStageIndex((value) => value + 1);
    setResolution(null);
    setShowHint(false);
  };

  const handleAnswer = (stage: VocabularyGameStage, optionId: string) => {
    if (resolution) return;

    const selectedOption = stage.options.find((option) => option.id === optionId);
    if (!selectedOption) return;

    const usedHint = showHint;
    const isCorrect = selectedOption.isCorrect;
    const rating = resolveGameRating(stage.successRating, isCorrect, usedHint);
    const basePoints = stage.type === "boss" ? 180 : stage.type === "sentence" ? 140 : 100;
    const streakBonus = isCorrect ? streak * 25 : 0;
    const pointsEarned = isCorrect ? Math.max(60, basePoints + streakBonus - (usedHint ? 35 : 0)) : 0;
    const nextHearts = isCorrect ? hearts : Math.max(0, hearts - 1);
    const nextStreak = isCorrect ? streak + 1 : 0;

    setResolution({
      selectedOptionId: optionId,
      isCorrect,
      pointsEarned,
      rating,
      remainingHearts: nextHearts,
      usedHint,
    });

    setHearts(nextHearts);
    setStreak(nextStreak);
    setBestStreak((value) => Math.max(value, nextStreak));

    if (isCorrect) {
      setScore((value) => value + pointsEarned);
      setCorrectAnswers((value) => value + 1);
    } else {
      setStreak(0);
    }

    reviewMutation.mutate({ cardId: stage.card.id, rating });
  };

  if (user?.role !== "student") {
    return (
      <DashboardLayout>
        <PageHeader
          title="Jogo de Vocabulario"
          description="Essa area foi pensada para transformar as palavras do aluno em fases jogaveis e reforcar a revisao."
        />

        <div className="mt-8 rounded-[28px] border border-border bg-card p-8 text-sm leading-7 text-muted-foreground shadow-sm">
          O jogo esta disponivel no portal do aluno, porque usa diretamente os cards de vocabulario e a fila de revisao individual.
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <PageHeader
          title="Jogo de Vocabulario"
          description="Cada fase nasce das palavras que o aluno precisa aprender. Acertar ajuda a revisar de verdade; errar devolve a palavra para mais pratica."
        />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <PixelStat icon={Gamepad2} label="Palavras jogaveis" value={stats?.total_learned_words || playableCards.length} tone="sky" />
          <PixelStat icon={Flag} label="Para hoje" value={(stats?.due_today || 0) + (stats?.overdue || 0)} tone="amber" />
          <PixelStat icon={Flame} label="Dificeis" value={stats?.difficult || 0} tone="rose" />
          <PixelStat icon={Star} label="Sequencia" value={`${stats?.study_streak || 0}d`} tone="emerald" />
        </div>

        {isLoading ? (
          <div className="rounded-[30px] border border-border bg-card p-10 text-sm text-muted-foreground">
            Carregando palavras para montar a jornada...
          </div>
        ) : playableCards.length === 0 ? (
          <EmptyGameState />
        ) : (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_360px]">
            <section className="space-y-6">
              {!activeRun ? (
                <GameIntroCard heroName={heroName} run={previewRun} onStart={() => startRun(mode)} />
              ) : isFinished ? (
                <GameSummaryCard
                  bestStreak={bestStreak}
                  correctAnswers={correctAnswers}
                  finishedReason={finishedReason}
                  modeLabel={activeRun.modeLabel}
                  missedAnswers={missedAnswers}
                  onRestart={() => startRun(mode)}
                  score={score}
                  totalStages={activeRun.totalStages}
                />
              ) : currentStage ? (
                <GameArena
                  currentStage={currentStage}
                  hearts={hearts}
                  heroName={heroName}
                  onAnswer={handleAnswer}
                  onNextStage={goToNextStage}
                  progress={runProgress}
                  resolution={resolution}
                  score={score}
                  showHint={showHint}
                  streak={streak}
                  toggleHint={() => setShowHint((value) => !value)}
                />
              ) : null}

              <div className="rounded-[28px] border border-border bg-card/95 p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Como o jogo funciona</p>
                    <h2 className="mt-2 text-xl font-semibold text-foreground">Regras pensadas para estudo de verdade</h2>
                  </div>
                  <Button asChild variant="outline">
                    <Link to={APP_PATHS.learnedWords}>Abrir meus cards</Link>
                  </Button>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  <RuleCard
                    icon={Heart}
                    title="4 vidas por rodada"
                    description="Errou, perde vida e a palavra volta para a fila com prioridade maior de revisao."
                  />
                  <RuleCard
                    icon={Shield}
                    title="Dica existe, mas custa"
                    description="Usar dica reduz a nota da palavra na rodada, mas evita travar o aluno no meio do jogo."
                  />
                  <RuleCard
                    icon={Trophy}
                    title="Fases curtas"
                    description="Cada sessao tem ate 9 fases, o bastante para estudar sem cansar e manter ritmo diario."
                  />
                </div>
              </div>
            </section>

            <aside className="space-y-4">
              <section className="rounded-[28px] border border-border bg-card/95 p-5 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Modo de jogo</p>
                    <h2 className="text-lg font-semibold text-foreground">Escolha a jornada</h2>
                  </div>
                </div>

                <div className="mt-4 space-y-2.5">
                  {MODE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => openPreview(option.value)}
                      disabled={isRunActive}
                      className={cn(
                        "w-full rounded-[22px] border px-4 py-3 text-left transition",
                        mode === option.value
                          ? "border-primary bg-primary/8 shadow-[0_16px_32px_-24px_rgba(14,165,233,0.5)]"
                          : "border-border bg-background hover:border-primary/40 hover:bg-primary/5",
                        isRunActive && "cursor-not-allowed opacity-60",
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold text-foreground">{option.label}</span>
                        {mode === option.value ? <span className="rounded-full bg-primary/12 px-2 py-1 text-[11px] font-semibold text-primary">selecionado</span> : null}
                      </div>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{option.description}</p>
                    </button>
                  ))}
                </div>

                <Button className="mt-4 w-full" size="lg" onClick={() => startRun(mode)} disabled={isRunActive || previewRun.totalStages === 0}>
                  <Play className="mr-2 h-4 w-4" />
                  {isRunActive ? "Rodada em andamento" : "Iniciar jornada"}
                </Button>
              </section>

              <section className="rounded-[28px] border border-border bg-card/95 p-5 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600">
                    <BookOpen className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Mundos</p>
                    <h2 className="text-lg font-semibold text-foreground">Fases da rodada</h2>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {(activeRun || previewRun).worlds.map((world) => (
                    <div
                      key={world.key}
                      className={cn(
                        "rounded-[22px] border p-4",
                        WORLD_TONE_CLASSES[world.tone].panel,
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-sm font-semibold text-foreground">{world.label}</h3>
                        <span className="rounded-full border border-white/70 bg-white/70 px-2 py-1 text-[11px] font-semibold text-foreground">
                          {world.stageCount} fases
                        </span>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">{world.description}</p>
                      <p className="mt-2 text-xs leading-5 text-foreground/80">{world.objective}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-[28px] border border-border bg-card/95 p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Ajuste pedagogico</p>
                <div className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">
                  <p>Acertou sem dica: a palavra ganha nota melhor e sai da frente da fila.</p>
                  <p>Acertou com dica: a palavra melhora, mas continua merecendo revisao em breve.</p>
                  <p>Errou: a palavra volta como prioridade, sem punir o aluno com sessao longa demais.</p>
                </div>
              </section>
            </aside>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

const EmptyGameState = () => (
  <div className="rounded-[32px] border border-dashed border-border bg-card/90 p-10 text-center shadow-sm">
    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[24px] bg-primary/10 text-primary">
      <Gamepad2 className="h-8 w-8" />
    </div>
    <h2 className="mt-5 text-2xl font-semibold text-foreground">Ainda nao ha palavras suficientes para jogar</h2>
    <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
      Assim que o aluno acumular cards de vocabulario, esta area pode virar um treino diario leve, curto e com impacto real na revisao.
    </p>
    <Button asChild className="mt-6">
      <Link to={APP_PATHS.learnedWords}>Ver palavras aprendidas</Link>
    </Button>
  </div>
);

const GameIntroCard = ({
  heroName,
  onStart,
  run,
}: {
  heroName: string;
  onStart: () => void;
  run: VocabularyGameRun;
}) => (
  <section className="overflow-hidden rounded-[34px] border border-[#6f40ff]/15 bg-[linear-gradient(180deg,#c5efff_0%,#effbff_48%,#92d36e_48%,#58b234_100%)] shadow-[0_35px_90px_-54px_rgba(24,87,135,0.6)]">
    <div className="border-b border-[#003c5a]/8 bg-white/45 px-6 py-4 backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#265c7a]">Proposta do jogo</p>
          <h2 className="mt-2 text-2xl font-semibold text-[#1c2e3a]">{run.introTitle}</h2>
        </div>
        <span className="rounded-full border border-white/70 bg-white/70 px-3 py-1 text-xs font-semibold text-[#1c2e3a]">
          {run.totalStages} fases prontas
        </span>
      </div>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-[#365362]">{run.introCopy}</p>
    </div>

    <div className="relative px-6 py-8">
      <div className="absolute left-8 top-5 h-10 w-20 rounded-full bg-white/80 blur-[1px]" />
      <div className="absolute left-20 top-10 h-8 w-16 rounded-full bg-white/70 blur-[1px]" />
      <div className="absolute right-8 top-5 flex gap-1.5">
        {Array.from({ length: GAME_HEARTS }).map((_, index) => (
          <Heart key={index} className="h-5 w-5 fill-[#ff6767] text-[#d62f2f]" />
        ))}
      </div>

      <div className="rounded-[28px] border-4 border-[#39220c] bg-[rgba(255,255,255,0.72)] px-5 py-6 text-center shadow-[0_12px_0_#c8d9de] sm:px-8">
        <p className="text-xs uppercase tracking-[0.24em] text-[#71431a]" style={PIXEL_FONT_STYLE}>
          {run.modeLabel}
        </p>
        <p className="mt-5 text-lg leading-[1.8] text-[#7d3000] sm:text-[1.55rem]" style={PIXEL_FONT_STYLE}>
          AS PALAVRAS DO ALUNO VIRAM FASES CURTAS, COM CONTEXTO, ESCOLHA E REVISAO REAL.
        </p>
      </div>

      <div className="mt-7 grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-end">
        <PixelCharacter label={heroName.toUpperCase()} subtitle="hero" tone="sky" />

        <div className="flex flex-col items-center gap-3">
          <div className="rounded-[18px] border-4 border-[#724312] bg-[#ffd256] px-5 py-4 shadow-[0_7px_0_#b38215]">
            <Trophy className="h-8 w-8 text-[#7c4a09]" />
          </div>
          <Button size="lg" className="rounded-2xl px-8" onClick={onStart}>
            <Play className="mr-2 h-4 w-4" />
            Iniciar jornada
          </Button>
        </div>

        <PixelCharacter label="GUARDIAO" subtitle="boss" tone="amber" />
      </div>
    </div>
  </section>
);

const GameArena = ({
  currentStage,
  hearts,
  heroName,
  onAnswer,
  onNextStage,
  progress,
  resolution,
  score,
  showHint,
  streak,
  toggleHint,
}: {
  currentStage: VocabularyGameStage;
  hearts: number;
  heroName: string;
  onAnswer: (stage: VocabularyGameStage, optionId: string) => void;
  onNextStage: () => void;
  progress: number;
  resolution: ResolutionState | null;
  score: number;
  showHint: boolean;
  streak: number;
  toggleHint: () => void;
}) => {
  const tone = WORLD_TONE_CLASSES[currentStage.worldTone];
  const correctOption = currentStage.options.find((option) => option.isCorrect);

  return (
    <section className="overflow-hidden rounded-[34px] border border-[#5a3712] bg-[linear-gradient(180deg,#b8edff_0%,#f8fdff_53%,#94d85c_53%,#3a981f_100%)] shadow-[0_35px_90px_-56px_rgba(24,87,135,0.62)]">
      <div className="border-b border-[#003c5a]/8 bg-white/48 px-5 py-4 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className={cn("rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]", tone.badge)}>
              {currentStage.worldLabel}
            </span>
            <span className="rounded-full border border-white/75 bg-white/75 px-3 py-1 text-[11px] font-semibold text-[#28414d]">
              Fase {currentStage.phase}
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              {Array.from({ length: GAME_HEARTS }).map((_, index) => (
                <Heart
                  key={index}
                  className={cn(
                    "h-5 w-5",
                    index < hearts ? "fill-[#ff6767] text-[#d62f2f]" : "text-[#f3b1b1]",
                  )}
                />
              ))}
            </div>
            <div className="rounded-full border border-white/75 bg-white/75 px-3 py-1 text-xs font-semibold text-[#28414d]">
              score {score}
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/70">
            <div className="h-full rounded-full bg-[#ff8b28] transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#2c4857]">
            streak {streak}
          </span>
        </div>
      </div>

      <div className="relative px-5 py-8 sm:px-7">
        <div className="absolute left-6 top-4 h-10 w-20 rounded-full bg-white/80 blur-[1px]" />
        <div className="absolute left-20 top-10 h-8 w-16 rounded-full bg-white/70 blur-[1px]" />
        <div className="absolute right-10 top-6 h-4 w-4 rounded-full bg-[#6b3ff8]" />
        <div className="absolute right-14 top-8 h-2 w-8 rounded-full bg-[#3f6cf8]" />

        <div className="mx-auto max-w-4xl rounded-[30px] border-4 border-[#39220c] bg-[rgba(255,255,255,0.74)] px-4 py-6 text-center shadow-[0_12px_0_#c8d9de] sm:px-8">
          <p className="text-xs uppercase tracking-[0.24em] text-[#71431a]" style={PIXEL_FONT_STYLE}>
            {currentStage.type === "boss" ? "Boss da rodada" : currentStage.supportText}
          </p>
          <p className="mt-5 text-base leading-[1.9] text-[#7d3000] sm:text-[1.4rem]" style={PIXEL_FONT_STYLE}>
            {currentStage.prompt.toUpperCase()}
          </p>
          <p className="mt-4 text-sm leading-7 text-[#365362]">{currentStage.supportText}</p>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <VocabularyAudioButton
              audioUrl={currentStage.card.audio_url}
              audioFileUrl={currentStage.card.audio_file_url}
              text={currentStage.card.word}
              label="Ouvir palavra"
              className="border-white/80 bg-white/80"
            />
            <Button variant="outline" onClick={toggleHint} disabled={Boolean(resolution)}>
              <Shield className="mr-2 h-4 w-4" />
              {showHint ? "Esconder dica" : "Usar dica"}
            </Button>
          </div>

          {showHint || resolution ? (
            <div className="mt-5 rounded-[22px] border border-[#abd8ea] bg-[#effaff] px-4 py-4 text-left text-sm leading-6 text-[#37586b]">
              <p className="font-semibold text-[#28414d]">Dica da fase</p>
              <p className="mt-2">{currentStage.hint}</p>
            </div>
          ) : null}

          <div className="mt-7 grid gap-4 md:grid-cols-3">
            {currentStage.options.map((option) => (
              <AnswerButton
                key={option.id}
                disabled={Boolean(resolution)}
                isCorrect={option.isCorrect}
                isSelected={resolution?.selectedOptionId === option.id}
                isStageResolved={Boolean(resolution)}
                label={option.text}
                onClick={() => onAnswer(currentStage, option.id)}
              />
            ))}
          </div>

          {resolution ? (
            <div className="mt-6 rounded-[22px] border border-white/75 bg-white/80 px-4 py-5 text-left shadow-sm">
              <p className={cn("text-sm font-semibold", resolution.isCorrect ? "text-emerald-700" : "text-red-700")}>
                {resolution.isCorrect ? "Boa. Palavra consolidada nesta rodada." : `Era "${correctOption?.text}" e a palavra perdeu prioridade de dominio.`}
              </p>
              <p className="mt-2 text-sm leading-6 text-[#37586b]">
                Traducao: <span className="font-semibold text-[#28414d]">{currentStage.card.translation}</span>
              </p>
              {currentStage.card.example_sentence ? (
                <p className="mt-2 text-sm leading-6 text-[#37586b]">
                  Frase completa: <span className="font-semibold text-[#28414d]">{currentStage.card.example_sentence}</span>
                </p>
              ) : null}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#5c7380]">
                  {resolution.isCorrect ? `+${resolution.pointsEarned} pontos` : "A palavra volta cedo para revisao"}
                </div>
                <Button onClick={onNextStage}>
                  {resolution.remainingHearts <= 0 ? "Ver resultado" : "Proxima fase"}
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-7 grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-end">
          <PixelCharacter label={heroName.toUpperCase()} subtitle={getVocabularyCategory(currentStage.card)} tone="sky" />
          <div className="rounded-[18px] border-4 border-[#724312] bg-[#ffd256] px-4 py-3 shadow-[0_7px_0_#b38215]">
            <Flag className="h-7 w-7 text-[#7c4a09]" />
          </div>
          <PixelCharacter label="GUARDIAO" subtitle={currentStage.worldLabel} tone={currentStage.worldTone === "amber" ? "amber" : "emerald"} />
        </div>
      </div>
    </section>
  );
};

const GameSummaryCard = ({
  bestStreak,
  correctAnswers,
  finishedReason,
  missedAnswers,
  modeLabel,
  onRestart,
  score,
  totalStages,
}: {
  bestStreak: number;
  correctAnswers: number;
  finishedReason: "cleared" | "out_of_hearts" | null;
  missedAnswers: number;
  modeLabel: string;
  onRestart: () => void;
  score: number;
  totalStages: number;
}) => (
  <section className="rounded-[34px] border border-border bg-card/95 p-8 shadow-[0_28px_70px_-48px_rgba(15,23,42,0.55)]">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Fim da rodada</p>
        <h2 className="mt-2 text-3xl font-semibold text-foreground">
          {finishedReason === "cleared" ? "Jornada concluida" : "Vidas esgotadas"}
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
          {finishedReason === "cleared"
            ? "O aluno terminou a sessao curta sem virar o estudo em algo cansativo. Esse e o ponto."
            : "Parar cedo tambem ensina: as palavras que travaram voltam com mais prioridade para a proxima rodada."}
        </p>
      </div>
      <span className="rounded-full border border-primary/20 bg-primary/8 px-3 py-1 text-xs font-semibold text-primary">
        {modeLabel}
      </span>
    </div>

    <div className="mt-6 grid gap-4 md:grid-cols-4">
      <SummaryTile label="Score" value={score} />
      <SummaryTile label="Acertos" value={`${correctAnswers}/${totalStages}`} />
      <SummaryTile label="Maior streak" value={bestStreak} />
      <SummaryTile label="Palavras para revisar" value={missedAnswers} />
    </div>

    <div className="mt-6 rounded-[24px] border border-border bg-muted/30 p-5 text-sm leading-7 text-muted-foreground">
      {finishedReason === "cleared"
        ? "Regra sugerida: se o aluno limpar a rodada, o proximo passo pode ser liberar um mundo mais contextual ou aumentar a presenca de frases reais."
        : "Regra sugerida: se as vidas acabarem antes da metade, a rodada seguinte deve manter menos fases e puxar mais dicas para evitar frustracao."}
    </div>

    <div className="mt-6 flex flex-wrap gap-3">
      <Button onClick={onRestart}>
        <RotateCcw className="mr-2 h-4 w-4" />
        Jogar novamente
      </Button>
      <Button asChild variant="outline">
        <Link to={APP_PATHS.learnedWords}>Voltar aos cards</Link>
      </Button>
    </div>
  </section>
);

const PixelStat = ({
  icon: Icon,
  label,
  tone,
  value,
}: {
  icon: typeof Gamepad2;
  label: string;
  tone: "sky" | "amber" | "rose" | "emerald";
  value: number | string;
}) => {
  const toneClass =
    tone === "amber"
      ? "bg-amber-500/10 text-amber-700"
      : tone === "rose"
        ? "bg-rose-500/10 text-rose-700"
        : tone === "emerald"
          ? "bg-emerald-500/10 text-emerald-700"
          : "bg-sky-500/10 text-sky-700";

  return (
    <div className="rounded-[24px] border border-border bg-card/95 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        <span className={cn("flex h-10 w-10 items-center justify-center rounded-2xl", toneClass)}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-4 text-3xl font-semibold text-foreground">{value}</p>
    </div>
  );
};

const PixelCharacter = ({
  label,
  subtitle,
  tone,
}: {
  label: string;
  subtitle: string;
  tone: "sky" | "emerald" | "amber";
}) => (
  <div className="flex items-end gap-3">
    <div
      className={cn(
        "h-20 w-20 rounded-[18px] border-4 shadow-[0_7px_0_rgba(0,0,0,0.16)]",
        tone === "sky"
          ? "border-[#17649f] bg-[linear-gradient(180deg,#60d4ff,#2f9fe0)]"
          : tone === "amber"
            ? "border-[#915316] bg-[linear-gradient(180deg,#ffd266,#f0a521)]"
            : "border-[#1f7a52] bg-[linear-gradient(180deg,#5ce0a7,#27b16b)]",
      )}
    />
    <div className="pb-1">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#28414d]" style={PIXEL_FONT_STYLE}>
        {label}
      </p>
      <p className="mt-1 text-xs text-[#3d5967]">{subtitle}</p>
    </div>
  </div>
);

const RuleCard = ({
  description,
  icon: Icon,
  title,
}: {
  description: string;
  icon: typeof Heart;
  title: string;
}) => (
  <div className="rounded-[22px] border border-border bg-background/70 p-4">
    <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
      <Icon className="h-5 w-5" />
    </span>
    <h3 className="mt-4 text-sm font-semibold text-foreground">{title}</h3>
    <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
  </div>
);

const SummaryTile = ({ label, value }: { label: string; value: number | string }) => (
  <div className="rounded-[22px] border border-border bg-background/70 p-4">
    <p className="text-sm text-muted-foreground">{label}</p>
    <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
  </div>
);

const AnswerButton = ({
  disabled,
  isCorrect,
  isSelected,
  isStageResolved,
  label,
  onClick,
}: {
  disabled: boolean;
  isCorrect: boolean;
  isSelected: boolean;
  isStageResolved: boolean;
  label: string;
  onClick: () => void;
}) => {
  const toneClass = isStageResolved
    ? isCorrect
      ? "border-[#165a22] bg-[#19a032] text-white shadow-[0_7px_0_#0c5f1b]"
      : isSelected
        ? "border-[#742114] bg-[#c84b22] text-white shadow-[0_7px_0_#8f3210]"
        : "border-[#4d2b0a] bg-[#d26f18] text-[#fffaef] opacity-55 shadow-[0_7px_0_#8a4200]"
    : "border-[#4d2b0a] bg-[#d26f18] text-[#fffaef] shadow-[0_7px_0_#8a4200] hover:-translate-y-0.5 hover:bg-[#e57b1b]";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "min-h-[88px] rounded-[18px] border-[3px] px-4 py-4 text-center text-sm font-semibold uppercase tracking-[0.18em] transition duration-150 disabled:cursor-not-allowed",
        toneClass,
      )}
      style={PIXEL_FONT_STYLE}
    >
      {label}
    </button>
  );
};

export default JogoVocabulario;
