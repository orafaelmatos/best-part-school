import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, CheckCircle2, Flag, Gamepad2, Heart, Lightbulb, Play, RotateCcw, XCircle } from "lucide-react";
import { Link } from "react-router-dom";

import DashboardLayout from "@/components/DashboardLayout";
import type { ReviewRating, VocabularyCard } from "@/components/FlashcardReview";
import PageHeader from "@/components/PageHeader";
import VocabularyAudioButton from "@/components/VocabularyAudioButton";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  IconTile,
  ListGroup,
  ListItem,
  ProgressBar,
  Screen,
  ScreenTitle,
  SectionHeader,
  SkeletonCard,
} from "@/components/student/ui";
import { iconStroke } from "@/design-system/tokens";
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
  { value: "difficult", label: "Foco nas difíceis", description: "Puxa primeiro as palavras com menor confiança." },
  { value: "mixed", label: "Mistura inteligente", description: "Mescla revisão, consolidação e manutenção." },
];

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
        title: "Não foi possível salvar a rodada",
        description: "A resposta do jogo não foi sincronizada com a revisão. Tente novamente na próxima fase.",
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
  const completedStages = activeRun ? Math.min(activeRun.totalStages, currentStageIndex + (resolution ? 1 : 0)) : 0;
  const isFinished = Boolean(finishedReason);
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
          title="Jogo de vocabulário"
          description="Esta área transforma as palavras do aluno em fases curtas e reforça a revisão."
        />

        <Card className="mt-8">
          <p className="text-body text-ink-secondary">
            O jogo está disponível no portal do aluno, porque usa diretamente as palavras de vocabulário e a fila de revisão individual.
          </p>
        </Card>
      </DashboardLayout>
    );
  }

  const modeLabel = MODE_OPTIONS.find((option) => option.value === mode)?.label || activeRun?.modeLabel || previewRun.modeLabel;

  return (
    <DashboardLayout>
      <Screen>
        <ScreenTitle
          title="Pratique suas palavras em fases curtas"
          description="Cada fase usa as palavras que você está aprendendo. Acertar ajuda na revisão; errar traz a palavra de volta para mais prática."
        />

        <Card as="section" aria-label="Resumo do vocabulário" padding="md">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <GameStat label="Palavras para jogar" value={stats?.total_learned_words || playableCards.length} />
            <GameStat label="Para hoje" value={(stats?.due_today || 0) + (stats?.overdue || 0)} />
            <GameStat label="Difíceis" value={stats?.difficult || 0} />
            <GameStat label="Sequência" value={`${stats?.study_streak || 0} ${stats?.study_streak === 1 ? "dia" : "dias"}`} />
          </dl>
        </Card>

        {isLoading ? (
          <SkeletonCard label="Carregando palavras para montar a rodada" lines={3} />
        ) : playableCards.length === 0 ? (
          <EmptyGameState />
        ) : (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
            <div className="space-y-8">
              {!activeRun ? (
                <GameIntroCard
                  mode={mode}
                  modeLabel={modeLabel}
                  onSelectMode={openPreview}
                  onStart={() => startRun(mode)}
                  run={previewRun}
                />
              ) : isFinished ? (
                <GameSummaryCard
                  bestStreak={bestStreak}
                  correctAnswers={correctAnswers}
                  finishedReason={finishedReason}
                  modeLabel={modeLabel}
                  missedAnswers={missedAnswers}
                  onChangeMode={() => openPreview(mode)}
                  onRestart={() => startRun(mode)}
                  score={score}
                  totalStages={activeRun.totalStages}
                />
              ) : currentStage ? (
                <GameArena
                  completedStages={completedStages}
                  currentStage={currentStage}
                  hearts={hearts}
                  onAnswer={handleAnswer}
                  onNextStage={goToNextStage}
                  resolution={resolution}
                  score={score}
                  showHint={showHint}
                  streak={streak}
                  toggleHint={() => setShowHint((value) => !value)}
                  totalStages={activeRun.totalStages}
                />
              ) : null}

              <section aria-labelledby="game-rules-title">
                <SectionHeader
                  id="game-rules-title"
                  title="Como o jogo funciona"
                  actionLabel="Minhas palavras"
                  actionTo={APP_PATHS.learnedWords}
                />
                <ListGroup>
                  <ListItem
                    leading={<IconTile icon={Heart} size="sm" />}
                    title={`${GAME_HEARTS} vidas por rodada`}
                    description="Errou, perde uma vida e a palavra volta para a fila com prioridade maior de revisão."
                  />
                  <ListItem
                    leading={<IconTile icon={Lightbulb} size="sm" />}
                    title="A dica ajuda, mas tem custo"
                    description="Usar a dica reduz a nota da palavra na rodada, mas evita que você trave no meio do jogo."
                  />
                  <ListItem
                    leading={<IconTile icon={Flag} size="sm" />}
                    title="Fases curtas"
                    description="Cada rodada tem até 9 fases, o bastante para estudar sem cansar e manter o ritmo diário."
                  />
                </ListGroup>
              </section>
            </div>

            <aside className="space-y-8">
              <section aria-labelledby="game-worlds-title">
                <SectionHeader id="game-worlds-title" title="Fases da rodada" />
                <ListGroup>
                  {(activeRun || previewRun).worlds.map((world) => (
                    <li key={world.key} className="space-y-1 px-4 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="text-body font-medium text-ink">{world.label}</h3>
                        <Badge className="shrink-0">{world.stageCount} {world.stageCount === 1 ? "fase" : "fases"}</Badge>
                      </div>
                      <p className="text-caption text-ink-secondary">{world.description}</p>
                      <p className="text-caption text-ink-muted">{world.objective}</p>
                    </li>
                  ))}
                </ListGroup>
              </section>

              <Card as="section" variant="muted" aria-labelledby="game-scoring-title">
                <h2 id="game-scoring-title" className="text-h4 text-ink">Como sua resposta conta</h2>
                <ul className="mt-3 space-y-3 text-body text-ink">
                  <li>Acertou sem dica: a palavra ganha nota melhor e sai da frente da fila.</li>
                  <li>Acertou com dica: a palavra melhora, mas continua pedindo revisão em breve.</li>
                  <li>Errou: a palavra volta como prioridade, sem transformar a rodada em uma sessão longa demais.</li>
                </ul>
              </Card>
            </aside>
          </div>
        )}
      </Screen>
    </DashboardLayout>
  );
};

const GameStat = ({ label, value }: { label: string; value: number | string }) => (
  <div className="min-w-0">
    <dt className="text-caption text-ink-muted">{label}</dt>
    <dd className="mt-1 text-h3 text-ink">{value}</dd>
  </div>
);

const EmptyGameState = () => (
  <Card>
    <EmptyState
      icon={Gamepad2}
      title="Adicione palavras para começar a jogar"
      description="O jogo usa as palavras do seu vocabulário. Assim que você tiver algumas salvas, as fases aparecem aqui."
      action={(
        <Button asChild>
          <Link to={APP_PATHS.learnedWords}>Ver meu vocabulário</Link>
        </Button>
      )}
    />
  </Card>
);

const GameIntroCard = ({
  mode,
  modeLabel,
  onSelectMode,
  onStart,
  run,
}: {
  mode: VocabularyGameMode;
  modeLabel: string;
  onSelectMode: (mode: VocabularyGameMode) => void;
  onStart: () => void;
  run: VocabularyGameRun;
}) => (
  <Card as="section" aria-labelledby="game-intro-title" className="space-y-5">
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="primary">{modeLabel}</Badge>
        <Badge>{run.totalStages} {run.totalStages === 1 ? "fase pronta" : "fases prontas"}</Badge>
        <Badge icon={<Heart aria-hidden="true" />}>{GAME_HEARTS} vidas</Badge>
      </div>
      <h2 id="game-intro-title" className="text-h3 text-ink">{run.introTitle}</h2>
      <p className="text-body text-ink-secondary">{run.introCopy}</p>
    </div>

    <div role="group" aria-labelledby="game-mode-label" className="space-y-2">
      <p id="game-mode-label" className="text-body font-medium text-ink">Escolha o modo</p>
      {MODE_OPTIONS.map((option) => {
        const selected = mode === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onSelectMode(option.value)}
            className={cn(
              "flex min-h-14 w-full items-start gap-3 rounded-lg border px-4 py-3 text-left transition-colors duration-150 ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              selected ? "border-primary bg-primary-subtle" : "border-line bg-surface hover:border-primary-soft",
            )}
          >
            <span
              className={cn(
                "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border",
                selected ? "border-primary bg-primary text-primary-foreground" : "border-disabled bg-surface",
              )}
              aria-hidden="true"
            >
              {selected ? <Check size={14} strokeWidth={2.5} /> : null}
            </span>
            <span className="min-w-0">
              <span className="block text-body font-semibold text-ink">{option.label}</span>
              <span className={cn("mt-0.5 block text-caption", selected ? "text-ink" : "text-ink-secondary")}>{option.description}</span>
            </span>
          </button>
        );
      })}
    </div>

    <Button type="button" size="lg" fullWidth className="sm:w-auto" onClick={onStart} disabled={run.totalStages === 0}>
      <Play aria-hidden="true" />
      Iniciar jornada
    </Button>
  </Card>
);

const GameArena = ({
  completedStages,
  currentStage,
  hearts,
  onAnswer,
  onNextStage,
  resolution,
  score,
  showHint,
  streak,
  toggleHint,
  totalStages,
}: {
  completedStages: number;
  currentStage: VocabularyGameStage;
  hearts: number;
  onAnswer: (stage: VocabularyGameStage, optionId: string) => void;
  onNextStage: () => void;
  resolution: ResolutionState | null;
  score: number;
  showHint: boolean;
  streak: number;
  toggleHint: () => void;
  totalStages: number;
}) => {
  const correctOption = currentStage.options.find((option) => option.isCorrect);
  const hintId = `game-hint-${currentStage.phase}`;

  return (
    <Card as="section" aria-label={`Fase ${currentStage.phase}`} padding="none" className="overflow-hidden">
      <div className="space-y-3 border-b border-line p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Badge tone="primary">{currentStage.worldLabel}</Badge>
            <Badge>Fase {currentStage.phase} de {totalStages}</Badge>
          </div>
          <div className="flex items-center gap-3">
            <span role="img" aria-label={`${hearts} de ${GAME_HEARTS} vidas`} className="flex items-center gap-0.5">
              {Array.from({ length: GAME_HEARTS }).map((_, index) => (
                <Heart
                  key={index}
                  size={18}
                  strokeWidth={iconStroke}
                  aria-hidden="true"
                  className={index < hearts ? "fill-danger text-danger" : "text-disabled"}
                />
              ))}
            </span>
            <span className="text-body font-semibold text-ink">{score} pts</span>
          </div>
        </div>
        <ProgressBar value={completedStages} max={totalStages} label="Progresso da rodada" />
        <div className="flex flex-wrap items-center justify-between gap-2 text-caption text-ink-muted">
          <span>{getVocabularyCategory(currentStage.card)}</span>
          <span>Sequência de acertos: {streak}</span>
        </div>
      </div>

      <div className="space-y-5 p-5 sm:p-6">
        <div className="space-y-2">
          {currentStage.type === "boss" ? <Badge tone="warning">Desafio final</Badge> : null}
          <h2 className="break-words text-h3 text-ink">{currentStage.prompt}</h2>
          <p className="text-body text-ink-secondary">{currentStage.supportText}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <VocabularyAudioButton
            cardId={currentStage.card.id}
            audioUrl={currentStage.card.audio_url}
            audioFileUrl={currentStage.card.audio_file_url}
            text={currentStage.card.word}
            label="Ouvir palavra"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={toggleHint}
            disabled={Boolean(resolution)}
            aria-expanded={showHint || Boolean(resolution)}
            aria-controls={hintId}
          >
            <Lightbulb aria-hidden="true" />
            {showHint ? "Esconder dica" : "Usar dica"}
          </Button>
        </div>

        {showHint || resolution ? (
          <div id={hintId} className="rounded-lg bg-primary-subtle px-4 py-3">
            <p className="text-label text-primary-dark">Dica da fase</p>
            <p className="mt-1 text-body text-ink">{currentStage.hint}</p>
          </div>
        ) : null}

        <div role="group" aria-label="Alternativas" className="grid gap-3 sm:grid-cols-2">
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

        <div aria-live="polite">
          {resolution ? (
            <div className={cn("space-y-3 rounded-lg p-4", resolution.isCorrect ? "bg-success-soft" : "bg-danger-soft")}>
              <div className="flex gap-3">
                {resolution.isCorrect ? (
                  <CheckCircle2 size={20} strokeWidth={iconStroke} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
                ) : (
                  <XCircle size={20} strokeWidth={iconStroke} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
                )}
                <div className="min-w-0 space-y-1 text-body text-ink">
                  <p className="font-semibold">
                    {resolution.isCorrect ? "Resposta certa. Palavra consolidada nesta rodada." : (
                      <>Resposta errada. Era <span lang="en">“{correctOption?.text}”</span>, e a palavra volta antes para revisão.</>
                    )}
                  </p>
                  <p>Tradução: <span className="font-semibold">{currentStage.card.translation}</span></p>
                  {currentStage.card.example_sentence ? (
                    <p>Frase completa: <span lang="en" className="font-semibold">{currentStage.card.example_sentence}</span></p>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-body text-ink">
                  {resolution.isCorrect ? `+${resolution.pointsEarned} pontos` : "A palavra volta cedo para revisão"}
                </p>
                <Button type="button" onClick={onNextStage}>
                  {resolution.remainingHearts <= 0 ? "Ver resultado" : "Próxima fase"}
                  <ArrowRight aria-hidden="true" />
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
};

const GameSummaryCard = ({
  bestStreak,
  correctAnswers,
  finishedReason,
  missedAnswers,
  modeLabel,
  onChangeMode,
  onRestart,
  score,
  totalStages,
}: {
  bestStreak: number;
  correctAnswers: number;
  finishedReason: "cleared" | "out_of_hearts" | null;
  missedAnswers: number;
  modeLabel: string;
  onChangeMode: () => void;
  onRestart: () => void;
  score: number;
  totalStages: number;
}) => (
  <Card as="section" aria-labelledby="game-summary-title" className="space-y-5">
    <div className="space-y-2">
      <Badge tone="primary">{modeLabel}</Badge>
      <h2 id="game-summary-title" className="text-h3 text-ink">
        {finishedReason === "cleared" ? "Jornada concluída" : "Vidas esgotadas"}
      </h2>
      <p className="text-body text-ink-secondary">
        {finishedReason === "cleared"
          ? "Você terminou uma rodada curta, sem transformar o estudo em algo cansativo."
          : "Parar cedo também ensina: as palavras que travaram voltam com mais prioridade na próxima rodada."}
      </p>
    </div>

    <dl className="grid grid-cols-2 gap-4 border-y border-line py-4 sm:grid-cols-4">
      <GameStat label="Pontos" value={score} />
      <GameStat label="Acertos" value={`${correctAnswers}/${totalStages}`} />
      <GameStat label="Maior sequência" value={bestStreak} />
      <GameStat label="Palavras para revisar" value={missedAnswers} />
    </dl>

    <p className="text-body text-ink-secondary">
      {finishedReason === "cleared"
        ? "Para variar, jogue de novo em outro modo ou revise as frases completas no seu vocabulário."
        : "Na próxima rodada, use a dica quando travar. Ela reduz os pontos, mas ajuda você a seguir em frente."}
    </p>

    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      <Button type="button" onClick={onRestart}>
        <RotateCcw aria-hidden="true" />
        Jogar novamente
      </Button>
      <Button type="button" variant="outline" onClick={onChangeMode}>Escolher outro modo</Button>
      <Button asChild variant="ghost">
        <Link to={APP_PATHS.learnedWords}>Voltar às palavras</Link>
      </Button>
    </div>
  </Card>
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
  const state = !isStageResolved ? "idle" : isCorrect ? "correct" : isSelected ? "wrong" : "dimmed";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex min-h-14 w-full items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left text-body-lg font-medium text-ink transition-[border-color,background-color,transform] duration-150 ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-default",
        state === "idle" && "border-line bg-surface hover:border-primary-soft hover:bg-primary-subtle motion-safe:active:scale-[0.98]",
        state === "correct" && "border-success bg-success-soft",
        state === "wrong" && "border-danger bg-danger-soft",
        state === "dimmed" && "border-line bg-surface opacity-60",
      )}
    >
      <span lang="en" className="min-w-0 break-words">{label}</span>
      {state === "correct" ? (
        <>
          <CheckCircle2 size={20} strokeWidth={iconStroke} className="shrink-0 text-success" aria-hidden="true" />
          <span className="sr-only">(resposta certa)</span>
        </>
      ) : null}
      {state === "wrong" ? (
        <>
          <XCircle size={20} strokeWidth={iconStroke} className="shrink-0 text-danger" aria-hidden="true" />
          <span className="sr-only">(sua resposta)</span>
        </>
      ) : null}
    </button>
  );
};

export default JogoVocabulario;
