import type { ReviewRating, VocabularyCard } from "@/components/FlashcardReview";

export type VocabularyGameMode = "review" | "difficult" | "mixed";
export type VocabularyGameChallengeType = "translation" | "sentence" | "boss";
export type VocabularyGameWorldKey = "meadow" | "forest" | "castle";

export type VocabularyGameOption = {
  id: string;
  text: string;
  isCorrect: boolean;
};

export type VocabularyGameStage = {
  id: string;
  card: VocabularyCard;
  worldKey: VocabularyGameWorldKey;
  worldLabel: string;
  worldDescription: string;
  worldTone: "sky" | "emerald" | "amber";
  phase: number;
  phaseInWorld: number;
  type: VocabularyGameChallengeType;
  prompt: string;
  supportText: string;
  hint: string;
  options: VocabularyGameOption[];
  successRating: ReviewRating;
  failRating: ReviewRating;
};

export type VocabularyGameWorld = {
  key: VocabularyGameWorldKey;
  label: string;
  description: string;
  objective: string;
  tone: "sky" | "emerald" | "amber";
  stageCount: number;
};

export type VocabularyGameRun = {
  mode: VocabularyGameMode;
  modeLabel: string;
  hearts: number;
  totalStages: number;
  introTitle: string;
  introCopy: string;
  stages: VocabularyGameStage[];
  worlds: VocabularyGameWorld[];
};

export const MAX_GAME_STAGES = 9;
export const GAME_HEARTS = 4;

const WORLD_DEFINITIONS: Array<Omit<VocabularyGameWorld, "stageCount">> = [
  {
    key: "meadow",
    label: "Campo de Treino",
    description: "Aquecimento rapido para ativar memoria e traducao.",
    objective: "Comece pelas palavras novas, vencidas ou esquecidas.",
    tone: "sky",
  },
  {
    key: "forest",
    label: "Floresta de Contexto",
    description: "Frases com lacuna para puxar uso real da palavra.",
    objective: "Troque traducao por contexto e consolidacao.",
    tone: "emerald",
  },
  {
    key: "castle",
    label: "Portao Final",
    description: "Palavras dificeis e chefes com mais pressao.",
    objective: "Feche a rodada vencendo os itens com maior risco de erro.",
    tone: "amber",
  },
];

const MODE_COPY: Record<VocabularyGameMode, Pick<VocabularyGameRun, "modeLabel" | "introTitle" | "introCopy">> = {
  review: {
    modeLabel: "Revisar hoje",
    introTitle: "Rodada focada em palavras que pedem revisao",
    introCopy: "O jogo puxa primeiro o que esta vencido, novo ou mais fragil para transformar revisao em progresso real.",
  },
  difficult: {
    modeLabel: "Foco nas dificeis",
    introTitle: "Missao de resgate das palavras mais criticas",
    introCopy: "Aqui entram as palavras com baixa confianca, mais erros e maior chance de voltar para a fila.",
  },
  mixed: {
    modeLabel: "Mistura inteligente",
    introTitle: "Jornada curta com palavras em varios niveis",
    introCopy: "Uma corrida equilibrada para revisar, consolidar e manter o estudo leve sem perder ritmo.",
  },
};

const CATEGORY_FALLBACK = "Vocabulary";

const normalizeWord = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const uniqueCards = (cards: VocabularyCard[]) => {
  const seen = new Set<string>();
  return cards.filter((card) => {
    const key = `${normalizeWord(card.word)}::${normalizeWord(card.translation)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const getVocabularyCategory = (card: VocabularyCard) =>
  card.category_name?.trim() || card.custom_category?.trim() || CATEGORY_FALLBACK;

export const isCardDue = (card: VocabularyCard, now = Date.now()) =>
  !card.last_reviewed_at || new Date(card.next_review_at).getTime() <= now;

export const isDifficultCard = (card: VocabularyCard) =>
  card.difficulty_level === "weak" || card.confidence_level < 45 || card.failure_count > 0;

const scoreCardForMode = (card: VocabularyCard, mode: VocabularyGameMode, now: number) => {
  const due = isCardDue(card, now);
  const difficult = isDifficultCard(card);
  const overdueHours = Math.max(0, Math.round((now - new Date(card.next_review_at).getTime()) / 36e5));
  const lowConfidence = Math.max(0, 100 - card.confidence_level);
  const failureBoost = card.failure_count * 14;
  const freshBoost = card.last_reviewed_at ? 0 : 18;

  const modeBoost =
    mode === "review"
      ? (due ? 130 : 0) + overdueHours
      : mode === "difficult"
        ? (difficult ? 120 : 0) + lowConfidence
        : (due ? 55 : 0) + (difficult ? 40 : 0);

  return modeBoost + lowConfidence + failureBoost + freshBoost + (card.mastered ? -30 : 0);
};

export const selectCardsForGame = (cards: VocabularyCard[], mode: VocabularyGameMode, maxStages = MAX_GAME_STAGES) => {
  const now = Date.now();
  const activeCards = uniqueCards(cards).filter((card) => !card.archived);
  const ranked = [...activeCards].sort((left, right) => {
    const scoreDiff = scoreCardForMode(right, mode, now) - scoreCardForMode(left, mode, now);
    if (scoreDiff !== 0) return scoreDiff;
    return left.word.localeCompare(right.word);
  });

  const filtered = ranked.filter((card) => {
    if (mode === "review") return isCardDue(card, now);
    if (mode === "difficult") return isDifficultCard(card);
    return true;
  });

  const primary = filtered.slice(0, maxStages);
  if (primary.length >= Math.min(maxStages, 3) || primary.length === ranked.length) {
    return primary;
  }

  const usedIds = new Set(primary.map((card) => card.id));
  for (const card of ranked) {
    if (usedIds.has(card.id)) continue;
    primary.push(card);
    usedIds.add(card.id);
    if (primary.length >= maxStages) break;
  }

  return primary;
};

const buildMask = (word: string) => word.replace(/[A-Za-z0-9]/g, "_");

export const maskWordInSentence = (sentence: string | undefined, word: string) => {
  const normalizedSentence = sentence?.trim();
  const normalizedWord = word.trim();
  if (!normalizedSentence || !normalizedWord) return "";

  const exactPattern = new RegExp(`\\b${escapeRegExp(normalizedWord)}\\b`, "i");
  if (exactPattern.test(normalizedSentence)) {
    return normalizedSentence.replace(exactPattern, buildMask(normalizedWord));
  }

  const loosePattern = new RegExp(escapeRegExp(normalizedWord), "i");
  if (loosePattern.test(normalizedSentence)) {
    return normalizedSentence.replace(loosePattern, buildMask(normalizedWord));
  }

  return "";
};

const describeHint = (card: VocabularyCard, type: VocabularyGameChallengeType) => {
  const pieces = [`Traducao: ${card.translation}.`];
  if (type !== "sentence" && card.example_sentence) {
    pieces.push(`Frase: ${card.example_sentence}`);
  }
  if (card.explanation) {
    pieces.push(card.explanation);
  }
  if (card.pronunciation) {
    pieces.push(`Pronuncia: ${card.pronunciation}.`);
  }
  return pieces.join(" ");
};

const describePrompt = (card: VocabularyCard, type: VocabularyGameChallengeType) => {
  const maskedSentence = maskWordInSentence(card.example_sentence, card.word);

  if (type === "sentence" && maskedSentence) {
    return {
      prompt: maskedSentence,
      supportText: "Complete a lacuna com a palavra correta para seguir em frente.",
    };
  }

  if (type === "boss") {
    return {
      prompt: maskedSentence || `Escolha a palavra que combina com "${card.translation}".`,
      supportText: maskedSentence
        ? `Modo chefe: a palavra tambem precisa bater com a traducao "${card.translation}".`
        : "Modo chefe: sem ajuda da traducao completa, confie na memoria.",
    };
  }

  return {
    prompt: `Qual palavra corresponde a "${card.translation}"?`,
    supportText: "Escolha a melhor opcao para manter a jornada viva.",
  };
};

const pickDistractors = (currentCard: VocabularyCard, cards: VocabularyCard[], amount: number) => {
  const currentWord = normalizeWord(currentCard.word);
  const currentCategory = getVocabularyCategory(currentCard);

  return uniqueCards(cards)
    .filter((candidate) => normalizeWord(candidate.word) !== currentWord)
    .sort((left, right) => {
      const leftScore =
        (getVocabularyCategory(left) === currentCategory ? 30 : 0) +
        (left.difficulty_level === currentCard.difficulty_level ? 18 : 0) +
        Math.max(0, 12 - Math.abs(left.word.length - currentCard.word.length)) +
        Math.max(0, 10 - Math.abs(left.translation.length - currentCard.translation.length));
      const rightScore =
        (getVocabularyCategory(right) === currentCategory ? 30 : 0) +
        (right.difficulty_level === currentCard.difficulty_level ? 18 : 0) +
        Math.max(0, 12 - Math.abs(right.word.length - currentCard.word.length)) +
        Math.max(0, 10 - Math.abs(right.translation.length - currentCard.translation.length));

      if (rightScore !== leftScore) return rightScore - leftScore;
      return left.word.localeCompare(right.word);
    })
    .slice(0, amount);
};

const buildOptions = (card: VocabularyCard, allCards: VocabularyCard[], phaseIndex: number) => {
  const distractors = pickDistractors(card, allCards, 2);
  const optionCount = distractors.length + 1;
  const correctSlot = optionCount > 0 ? phaseIndex % optionCount : 0;
  const baseOptions = distractors.map((item, index) => ({
    id: `${card.id}-wrong-${index}`,
    text: item.word,
    isCorrect: false,
  }));

  const options = [...baseOptions];
  options.splice(correctSlot, 0, {
    id: `${card.id}-correct`,
    text: card.word,
    isCorrect: true,
  });

  return options;
};

const getChallengeType = (phaseIndex: number, card: VocabularyCard) => {
  const worldIndex = Math.min(Math.floor(phaseIndex / 3), WORLD_DEFINITIONS.length - 1);
  const phaseInWorld = phaseIndex % 3;
  const hasSentence = Boolean(maskWordInSentence(card.example_sentence, card.word));

  if (worldIndex === 0) {
    return hasSentence && phaseInWorld > 0 ? "sentence" : "translation";
  }

  if (worldIndex === 1) {
    return hasSentence ? "sentence" : "translation";
  }

  return hasSentence ? "boss" : "translation";
};

export const resolveGameRating = (
  successRating: ReviewRating,
  wasCorrect: boolean,
  usedHint: boolean,
) => {
  if (!wasCorrect) return "very_hard";
  if (usedHint && successRating === "easy") return "hard";
  return successRating;
};

export const buildVocabularyGameRun = (cards: VocabularyCard[], mode: VocabularyGameMode): VocabularyGameRun => {
  const selectedCards = selectCardsForGame(cards, mode, MAX_GAME_STAGES);
  const stages = selectedCards.map((card, index) => {
    const worldDefinition = WORLD_DEFINITIONS[Math.min(Math.floor(index / 3), WORLD_DEFINITIONS.length - 1)];
    const phaseInWorld = (index % 3) + 1;
    const type = getChallengeType(index, card);
    const { prompt, supportText } = describePrompt(card, type);

    return {
      id: `${card.id}-${index}`,
      card,
      worldKey: worldDefinition.key,
      worldLabel: worldDefinition.label,
      worldDescription: worldDefinition.description,
      worldTone: worldDefinition.tone,
      phase: index + 1,
      phaseInWorld,
      type,
      prompt,
      supportText,
      hint: describeHint(card, type),
      options: buildOptions(card, cards, index),
      successRating: type === "translation" ? "hard" : "easy",
      failRating: "very_hard",
    } satisfies VocabularyGameStage;
  });

  const worlds = WORLD_DEFINITIONS.map((world) => {
    const stageCount = stages.filter((stage) => stage.worldKey === world.key).length;
    return { ...world, stageCount };
  }).filter((world) => world.stageCount > 0);

  return {
    mode,
    modeLabel: MODE_COPY[mode].modeLabel,
    hearts: GAME_HEARTS,
    totalStages: stages.length,
    introTitle: MODE_COPY[mode].introTitle,
    introCopy: MODE_COPY[mode].introCopy,
    stages,
    worlds,
  };
};
