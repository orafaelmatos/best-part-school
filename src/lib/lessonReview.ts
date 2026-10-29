import { BookOpen, Pencil, Languages, MessagesSquare, ListChecks, Puzzle, Headphones, Mic, Library, Trophy } from "lucide-react";
import type { GuidedChoice } from "@/lib/aiStudy";

export const reviewActivityIcons = {
  grammar: BookOpen, sentences: Pencil, translation: Languages, conversation: MessagesSquare,
  quiz: ListChecks, fill: Puzzle, listening: Headphones, speaking: Mic, vocabulary: Library, challenge: Trophy,
};

// Offer the guided flow to conversations created before it existed, too.
export const reviewActivityChoices: GuidedChoice[] = [
  ["grammar", "Revisar gramática", "Entenda a estrutura com exemplos simples."],
  ["sentences", "Criar frases", "Construa frases e receba correções explicadas."],
  ["translation", "Traduzir frases", "Traduza do português para o inglês."],
  ["conversation", "Conversar com IA", "Converse sobre os assuntos da sua aula."],
  ["quiz", "Responder quiz", "Escolha entre as alternativas A, B, C e D."],
  ["fill", "Completar frases", "Complete a palavra ou estrutura que falta."],
  ["listening", "Praticar listening", "Ouça um áudio e responda sobre o que entendeu."],
  ["speaking", "Praticar speaking", "Fale em inglês e receba feedback do seu áudio."],
  ["vocabulary", "Revisar vocabulário", "Pratique as palavras e expressões aprendidas."],
  ["challenge", "Desafio da aula", "Teste seu aprendizado com atividades variadas."],
].map(([value, label, description]) => ({ id: value, value, label, description, action_type: "review_activity" }));
