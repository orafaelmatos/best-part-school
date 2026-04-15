export interface Lesson {
  id: string;
  title: string;
  date: string;
  time: string;
  status: "completed" | "upcoming" | "rescheduled" | "canceled";
  newWords: string[];
  teacherNotes: string;
  recordingUrl: string;
  files: { name: string; url: string }[];
  teacher: string;
}

export const lessons: Lesson[] = [
  {
    id: "1",
    title: "Present Perfect vs Past Simple",
    date: "2026-04-01",
    time: "14:00",
    status: "completed",
    newWords: ["achievement", "lately", "recently", "accomplish"],
    teacherNotes: "Great progress on distinguishing between present perfect and past simple. Focus on time markers like 'already', 'yet', 'just'. Practice more with real-life examples.",
    recordingUrl: "#",
    files: [{ name: "Homework_Unit5.pdf", url: "#" }],
    teacher: "Sarah Miller",
  },
  {
    id: "2",
    title: "Business Email Writing",
    date: "2026-04-03",
    time: "14:00",
    status: "completed",
    newWords: ["regarding", "inquire", "furthermore", "sincerely"],
    teacherNotes: "Good structure in formal emails. Remember to use passive voice more in business contexts. Review the email templates shared.",
    recordingUrl: "#",
    files: [{ name: "Email_Templates.pdf", url: "#" }, { name: "Exercise_Formal.pdf", url: "#" }],
    teacher: "Sarah Miller",
  },
  {
    id: "3",
    title: "Phrasal Verbs in Context",
    date: "2026-04-05",
    time: "14:00",
    status: "rescheduled",
    newWords: ["come up with", "look into", "bring up", "carry out"],
    teacherNotes: "Rescheduled to April 7th. Please review the phrasal verbs list before class.",
    recordingUrl: "",
    files: [],
    teacher: "Sarah Miller",
  },
  {
    id: "4",
    title: "Conditional Sentences",
    date: "2026-04-08",
    time: "14:00",
    status: "upcoming",
    newWords: [],
    teacherNotes: "",
    recordingUrl: "",
    files: [{ name: "Conditionals_Prep.pdf", url: "#" }],
    teacher: "Sarah Miller",
  },
  {
    id: "5",
    title: "Travel Vocabulary & Situations",
    date: "2026-04-10",
    time: "14:00",
    status: "upcoming",
    newWords: [],
    teacherNotes: "",
    recordingUrl: "",
    files: [],
    teacher: "Sarah Miller",
  },
  {
    id: "6",
    title: "Job Interview Simulation",
    date: "2026-04-15",
    time: "14:00",
    status: "upcoming",
    newWords: [],
    teacherNotes: "",
    recordingUrl: "",
    files: [],
    teacher: "Sarah Miller",
  },
  {
    id: "7",
    title: "Listening Comprehension - TED Talks",
    date: "2026-03-25",
    time: "14:00",
    status: "completed",
    newWords: ["perseverance", "breakthrough", "resilience"],
    teacherNotes: "Excellent listening skills. Try watching TED talks without subtitles this week.",
    recordingUrl: "#",
    files: [],
    teacher: "Sarah Miller",
  },
  {
    id: "8",
    title: "Grammar Review - Passive Voice",
    date: "2026-03-20",
    time: "14:00",
    status: "canceled",
    newWords: [],
    teacherNotes: "Canceled due to holiday.",
    recordingUrl: "",
    files: [],
    teacher: "Sarah Miller",
  },
];

export interface Course {
  id: string;
  title: string;
  description: string;
  price: number;
  originalPrice?: number;
  isFree: boolean;
  discount?: number;
  category: "students" | "visitors";
  image: string;
}

export const courses: Course[] = [
  {
    id: "1",
    title: "Pronunciation Masterclass",
    description: "Master American English pronunciation with targeted exercises and feedback.",
    price: 49.9,
    originalPrice: 99.9,
    isFree: false,
    discount: 50,
    category: "students",
    image: "🎙️",
  },
  {
    id: "2",
    title: "Business English Essentials",
    description: "Learn professional vocabulary, email writing, and meeting skills.",
    price: 79.9,
    originalPrice: 129.9,
    isFree: false,
    discount: 38,
    category: "students",
    image: "💼",
  },
  {
    id: "3",
    title: "IELTS Preparation",
    description: "Complete preparation for all four IELTS modules with practice tests.",
    price: 0,
    isFree: true,
    category: "students",
    image: "📝",
  },
  {
    id: "4",
    title: "Conversational English",
    description: "Build confidence in everyday English conversations with native speakers.",
    price: 99.9,
    isFree: false,
    category: "visitors",
    image: "💬",
  },
  {
    id: "5",
    title: "English for Travel",
    description: "Essential phrases and vocabulary for traveling abroad with confidence.",
    price: 59.9,
    isFree: false,
    category: "visitors",
    image: "✈️",
  },
  {
    id: "6",
    title: "Grammar Fundamentals",
    description: "Build a solid foundation in English grammar from beginner to intermediate.",
    price: 89.9,
    isFree: false,
    category: "visitors",
    image: "📖",
  },
];

export interface Payment {
  id: string;
  date: string;
  amount: number;
  status: "paid" | "pending" | "failed";
  method: string;
  description: string;
}

export const payments: Payment[] = [
  { id: "1", date: "2026-04-01", amount: 450.0, status: "paid", method: "Cartão de crédito", description: "Mensalidade Abril" },
  { id: "2", date: "2026-03-01", amount: 450.0, status: "paid", method: "Cartão de crédito", description: "Mensalidade Março" },
  { id: "3", date: "2026-02-01", amount: 450.0, status: "paid", method: "PIX", description: "Mensalidade Fevereiro" },
  { id: "4", date: "2026-01-01", amount: 450.0, status: "paid", method: "PIX", description: "Mensalidade Janeiro" },
  { id: "5", date: "2026-05-01", amount: 450.0, status: "pending", method: "—", description: "Mensalidade Maio" },
  { id: "6", date: "2025-12-01", amount: 49.9, status: "failed", method: "Cartão de crédito", description: "Curso Pronunciation Masterclass" },
];

export interface ChatMessage {
  id: string;
  sender: "user" | "ai";
  text: string;
  timestamp: string;
  audio_url?: string;
}

export const aiChatMessages: ChatMessage[] = [
  { id: "1", sender: "ai", text: "Hello! I'm your AI English practice assistant. Let's start our conversation. How are you today?", timestamp: "14:00" },
  { id: "2", sender: "user", text: "Hi! I'm doing great, thanks. I want to practice for a job interview.", timestamp: "14:01" },
  { id: "3", sender: "ai", text: "Great choice! Let's simulate a job interview. I'll be the interviewer. Ready? Let's begin:\n\n\"Thank you for coming in today. Could you start by telling me a little about yourself?\"", timestamp: "14:01" },
];
