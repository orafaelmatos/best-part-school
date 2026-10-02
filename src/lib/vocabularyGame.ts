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
const DISTRACTOR_COUNT = 3;

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

const comparableText = (value: string | undefined) => normalizeWord(value || "").replace(/[^a-z0-9\s]/g, " ");

const tokenizeComparableText = (value: string | undefined) =>
  comparableText(value)
    .split(/\s+/)
    .filter((token) => token.length > 1);

const levenshteinDistance = (left: string, right: string) => {
  if (left === right) return 0;
  if (!left) return right.length;
  if (!right) return left.length;

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = new Array(right.length + 1).fill(0);

  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const substitutionCost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + substitutionCost,
      );
    }
    for (let j = 0; j <= right.length; j += 1) {
      previous[j] = current[j];
    }
  }

  return previous[right.length];
};

const stringSimilarity = (leftValue: string | undefined, rightValue: string | undefined) => {
  const left = comparableText(leftValue).replace(/\s+/g, "");
  const right = comparableText(rightValue).replace(/\s+/g, "");
  const longestLength = Math.max(left.length, right.length);
  if (!longestLength) return 0;
  return 1 - levenshteinDistance(left, right) / longestLength;
};

const optionKey = (value: string) => comparableText(value).replace(/\s+/g, "");

const COMMON_CONFUSABLE_WORDS = [
  "a",
  "an",
  "and",
  "are",
  "at",
  "ate",
  "back",
  "bad",
  "be",
  "beat",
  "been",
  "being",
  "best",
  "bet",
  "big",
  "bite",
  "bring",
  "brought",
  "buy",
  "came",
  "can",
  "could",
  "did",
  "do",
  "does",
  "doing",
  "done",
  "drink",
  "drank",
  "drive",
  "drove",
  "each",
  "east",
  "easy",
  "easily",
  "eager",
  "eat",
  "eaten",
  "eater",
  "eating",
  "eats",
  "feel",
  "fell",
  "felt",
  "find",
  "found",
  "get",
  "gets",
  "getting",
  "give",
  "gave",
  "go",
  "goes",
  "going",
  "gone",
  "good",
  "got",
  "great",
  "had",
  "has",
  "have",
  "having",
  "he",
  "hear",
  "heard",
  "heart",
  "heat",
  "help",
  "her",
  "here",
  "him",
  "his",
  "hit",
  "home",
  "is",
  "it",
  "its",
  "know",
  "knew",
  "learn",
  "leave",
  "left",
  "let",
  "like",
  "listen",
  "look",
  "look at",
  "look for",
  "look up",
  "made",
  "make",
  "makes",
  "making",
  "many",
  "map",
  "me",
  "meal",
  "mean",
  "meat",
  "meet",
  "met",
  "miss",
  "more",
  "most",
  "near",
  "neat",
  "need",
  "new",
  "nice",
  "night",
  "no",
  "not",
  "now",
  "of",
  "off",
  "on",
  "one",
  "outgoing",
  "play",
  "played",
  "playing",
  "read",
  "right",
  "road",
  "run",
  "ran",
  "said",
  "say",
  "says",
  "see",
  "saw",
  "seat",
  "she",
  "should",
  "speak",
  "spoke",
  "take",
  "takes",
  "taking",
  "talk",
  "teach",
  "team",
  "tear",
  "tea",
  "tell",
  "test",
  "that",
  "the",
  "their",
  "there",
  "they",
  "this",
  "to",
  "took",
  "tour",
  "trip",
  "very",
  "want",
  "was",
  "watch",
  "we",
  "went",
  "were",
  "what",
  "when",
  "where",
  "will",
  "with",
  "word",
  "work",
  "would",
  "write",
  "wrote",
  "you",
];

const DIRECT_CONFUSIONS: Record<string, string[]> = {
  eat: ["ate", "eats", "eating", "eaten", "meat", "heat"],
  ate: ["eat", "eats", "eating", "eaten", "eight", "hate"],
  eaten: ["eat", "ate", "eating", "eats"],
  make: ["made", "makes", "making", "maker"],
  made: ["make", "makes", "making", "maid"],
  go: ["goes", "going", "gone", "went"],
  went: ["go", "goes", "going", "gone"],
  do: ["does", "doing", "did", "done"],
  did: ["do", "does", "doing", "done"],
  have: ["has", "had", "having", "haves"],
  be: ["am", "is", "are", "being"],
  am: ["is", "are", "be", "was"],
  is: ["am", "are", "be", "was"],
  are: ["am", "is", "be", "were"],
  take: ["takes", "taking", "took", "taken"],
  took: ["take", "takes", "taking", "taken"],
  speak: ["speaks", "speaking", "spoke", "spoken"],
  write: ["writes", "writing", "wrote", "written"],
  read: ["reads", "reading", "reader"],
  easygoing: ["outgoing", "easy", "easily", "eager"],
  airport: ["airplane", "airline", "airfare", "airfield"],
};

const PREPOSITION_SWAPS: Record<string, string[]> = {
  at: ["in", "on", "to"],
  by: ["with", "for", "from"],
  for: ["to", "from", "with"],
  from: ["for", "to", "with"],
  in: ["on", "at", "to"],
  into: ["onto", "inside", "in"],
  of: ["off", "for", "from"],
  on: ["in", "at", "to"],
  to: ["for", "from", "at"],
  up: ["out", "off", "down"],
  with: ["for", "by", "from"],
};

const regularInflections = (word: string) => {
  if (!word || /\s/.test(word)) return [];
  if (word.length <= 2) {
    return [`${word}s`, `${word}ed`, `${word}ing`];
  }
  if (word.endsWith("y") && !/[aeiou]y$/.test(word)) {
    return [`${word.slice(0, -1)}ies`, `${word.slice(0, -1)}ied`, `${word}ing`];
  }
  if (word.endsWith("e")) {
    return [`${word}s`, `${word}d`, `${word.slice(0, -1)}ing`, `${word}r`];
  }
  return [`${word}s`, `${word}ed`, `${word}ing`, `${word}er`];
};

const phraseConfusions = (word: string) => {
  const tokens = tokenizeComparableText(word);
  if (tokens.length < 2) return [];

  const variants: string[] = [];
  tokens.forEach((token, tokenIndex) => {
    PREPOSITION_SWAPS[token]?.forEach((swap) => {
      const nextTokens = [...tokens];
      nextTokens[tokenIndex] = swap;
      variants.push(nextTokens.join(" "));
    });
  });

  const lastToken = tokens[tokens.length - 1];
  regularInflections(lastToken).forEach((variant) => {
    variants.push([...tokens.slice(0, -1), variant].join(" "));
  });

  return variants;
};

const closeLexiconConfusions = (word: string) =>
  COMMON_CONFUSABLE_WORDS
    .filter((candidate) => optionKey(candidate) !== optionKey(word))
    .map((candidate) => ({
      candidate,
      score: stringSimilarity(candidate, word),
    }))
    .filter(({ score }) => score >= 0.45)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.candidate.localeCompare(right.candidate);
    })
    .map(({ candidate }) => candidate);

const spellingConfusions = (word: string) => {
  const normalized = comparableText(word).replace(/\s+/g, "");
  if (normalized.length < 3 || normalized.length > 12) return [];

  const variants: string[] = [];
  for (let index = 0; index < normalized.length - 1; index += 1) {
    variants.push(
      `${normalized.slice(0, index)}${normalized[index + 1]}${normalized[index]}${normalized.slice(index + 2)}`,
    );
  }

  if (normalized.length <= 5) {
    ["b", "h", "m", "s", "t"].forEach((letter) => variants.push(`${letter}${normalized}`));
    ["e", "s", "t"].forEach((letter) => variants.push(`${normalized}${letter}`));
  }

  return variants;
};

const buildGeneratedDistractors = (card: VocabularyCard, amount: number) => {
  const correctText = card.word.trim();
  const correctKey = optionKey(correctText);
  const normalized = comparableText(correctText).replace(/\s+/g, "");
  const seen = new Set([correctKey]);
  const candidates: string[] = [];

  const addCandidates = (values: string[]) => {
    values.forEach((value) => {
      const candidate = value.trim().replace(/\s+/g, " ");
      const key = optionKey(candidate);
      const looksLikeOption = candidate.length <= 28 && /^[A-Za-z][A-Za-z\s'-]*$/.test(candidate);
      if (!candidate || !looksLikeOption || seen.has(key)) return;
      seen.add(key);
      candidates.push(candidate);
    });
  };

  addCandidates(DIRECT_CONFUSIONS[normalized] || []);
  addCandidates(phraseConfusions(correctText));
  addCandidates(closeLexiconConfusions(correctText));
  addCandidates(regularInflections(normalized));
  addCandidates(spellingConfusions(correctText));

  return candidates.slice(0, amount);
};

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

const pickPromptVariant = (items: string[], phaseIndex: number) => items[phaseIndex % items.length];

const describePrompt = (card: VocabularyCard, type: VocabularyGameChallengeType, phaseIndex: number) => {
  const maskedSentence = maskWordInSentence(card.example_sentence, card.word);

  if (type === "sentence" && maskedSentence) {
    return {
      prompt: pickPromptVariant(
        [
          `A frase perdeu uma peça: ${maskedSentence}`,
          `Decifre a fala do personagem: ${maskedSentence}`,
          `Complete o pergaminho antes que ele apague: ${maskedSentence}`,
        ],
        phaseIndex,
      ),
      supportText: pickPromptVariant(
        [
          "Escolha a forma que encaixa no contexto. As falsas foram feitas para parecer certas.",
          "Compare tempo verbal e sentido da frase antes de tocar na carta.",
          "Uma terminação muda tudo: confira se a palavra combina com a lacuna.",
        ],
        phaseIndex,
      ),
    };
  }

  if (type === "boss") {
    return {
      prompt: maskedSentence
        ? pickPromptVariant(
            [
              `Boss de contexto: ${maskedSentence}`,
              `O guardiao embaralhou a frase: ${maskedSentence}`,
              `Ultimo portal: qual carta completa "${maskedSentence}"?`,
            ],
            phaseIndex,
          )
        : pickPromptVariant(
            [
              `O guardiao escondeu "${card.translation}" entre cartas quase iguais. Qual e a correta?`,
              `Desafio final: encontre a palavra exata para "${card.translation}".`,
              `A chave do portal traduz "${card.translation}". Nao caia nas formas parecidas.`,
            ],
            phaseIndex,
          ),
      supportText: maskedSentence
        ? `Modo chefe: a palavra tambem precisa bater com a traducao "${card.translation}".`
        : "Modo chefe: as alternativas confundem pela forma, pelo som ou pela terminacao.",
    };
  }

  return {
    prompt: pickPromptVariant(
      [
        `A pista do mapa e "${card.translation}". Qual carta abre a passagem?`,
        `Missao relampago: escolha a palavra em ingles para "${card.translation}".`,
        `O personagem quer dizer "${card.translation}". Qual palavra ele deve usar?`,
        `A traducao apareceu no cristal: "${card.translation}". Encontre a forma certa.`,
      ],
      phaseIndex,
    ),
    supportText: pickPromptVariant(
      [
        "Cuidado: as cartas falsas imitam a palavra certa de proposito.",
        "Olhe letra por letra e pense na forma correta, nao so no som parecido.",
        "Algumas opcoes parecem corretas, mas mudam tempo verbal, classe ou sentido.",
        "A melhor resposta e a palavra exata do card, sem cair nas variacoes.",
      ],
      phaseIndex,
    ),
  };
};

const buildOptions = (card: VocabularyCard, phaseIndex: number) => {
  const distractors = buildGeneratedDistractors(card, DISTRACTOR_COUNT);
  const optionCount = distractors.length + 1;
  const correctSlot = optionCount > 0 ? phaseIndex % optionCount : 0;
  const baseOptions = distractors.map((item, index) => ({
    id: `${card.id}-wrong-${index}`,
    text: item,
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
    const { prompt, supportText } = describePrompt(card, type, index);

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
      options: buildOptions(card, index),
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
