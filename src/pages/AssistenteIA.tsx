import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import PageHeader from "@/components/PageHeader";
import { aiChatMessages, ChatMessage } from "@/data/mockData";
import { Send, Mic, ArrowLeft } from "lucide-react";

type PracticeType = "speaking" | "listening" | "writing";
type Scenario = "travel" | "interview" | "daily" | "business" | "restaurant" | "custom";

const practiceTypes: { value: PracticeType; label: string; emoji: string }[] = [
  { value: "speaking", label: "Speaking", emoji: "🗣️" },
  { value: "listening", label: "Listening", emoji: "👂" },
  { value: "writing", label: "Writing", emoji: "✍️" },
];

const scenarios: { value: Scenario; label: string; emoji: string }[] = [
  { value: "travel", label: "Travel", emoji: "✈️" },
  { value: "interview", label: "Job Interview", emoji: "💼" },
  { value: "daily", label: "Daily Conversation", emoji: "💬" },
  { value: "business", label: "Business Meeting", emoji: "📊" },
  { value: "restaurant", label: "Restaurant", emoji: "🍽️" },
  { value: "custom", label: "Custom", emoji: "⚙️" },
];

const aiResponses = [
  "That's a great answer! Your use of vocabulary is improving. Let me ask you another question...",
  "Interesting point! Try using more complex sentence structures. For example, you could say...",
  "Well done! I noticed you used the present perfect correctly. Let's continue practicing.",
];

const AssistenteIA = () => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [practiceType, setPracticeType] = useState<PracticeType | null>(null);
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(aiChatMessages);
  const [input, setInput] = useState("");

  const handleSelectType = (type: PracticeType) => {
    setPracticeType(type);
    setStep(2);
  };

  const handleSelectScenario = (s: Scenario) => {
    setScenario(s);
    setStep(3);
  };

  const handleSend = () => {
    if (!input.trim()) return;
    const userMsg: ChatMessage = { id: Date.now().toString(), sender: "user", text: input, timestamp: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) };
    const aiMsg: ChatMessage = { id: (Date.now() + 1).toString(), sender: "ai", text: aiResponses[Math.floor(Math.random() * aiResponses.length)], timestamp: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) };
    setMessages((prev) => [...prev, userMsg, aiMsg]);
    setInput("");
  };

  const back = () => {
    if (step === 3) setStep(2);
    else if (step === 2) setStep(1);
  };

  return (
    <DashboardLayout>
      {step < 3 && <PageHeader title="Praticar com IA" description="Escolha como quer praticar seu inglês." />}

      {step > 1 && step < 3 && (
        <button onClick={back} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6 sidebar-transition">
          <ArrowLeft size={16} /> Voltar
        </button>
      )}

      {step === 1 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl">
          {practiceTypes.map((t) => (
            <button
              key={t.value}
              onClick={() => handleSelectType(t.value)}
              className="border border-border rounded-xl p-8 bg-card text-center hover:shadow-sm hover:border-foreground/20 sidebar-transition"
            >
              <span className="text-4xl block mb-3">{t.emoji}</span>
              <span className="font-semibold text-card-foreground">{t.label}</span>
            </button>
          ))}
        </div>
      )}

      {step === 2 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-w-2xl">
          {scenarios.map((s) => (
            <button
              key={s.value}
              onClick={() => handleSelectScenario(s.value)}
              className="border border-border rounded-xl p-6 bg-card text-center hover:shadow-sm hover:border-foreground/20 sidebar-transition"
            >
              <span className="text-3xl block mb-2">{s.emoji}</span>
              <span className="font-medium text-card-foreground text-sm">{s.label}</span>
            </button>
          ))}
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col h-[calc(100vh-4rem)]">
          <div className="flex items-center gap-3 pb-4 border-b border-border">
            <button onClick={back} className="p-2 rounded-lg hover:bg-accent sidebar-transition">
              <ArrowLeft size={18} />
            </button>
            <div>
              <h2 className="font-semibold text-foreground">Assistente IA</h2>
              <p className="text-xs text-muted-foreground capitalize">
                {practiceType} · {scenarios.find((s) => s.value === scenario)?.label}
              </p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto py-6 space-y-4">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[70%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                  msg.sender === "user"
                    ? "bg-primary text-primary-foreground rounded-br-md"
                    : "bg-secondary text-secondary-foreground rounded-bl-md"
                }`}>
                  <p className="whitespace-pre-line">{msg.text}</p>
                  <p className={`text-[10px] mt-1 ${msg.sender === "user" ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                    {msg.timestamp}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-border pt-4 pb-2">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder="Type your message..."
                className="flex-1 px-4 py-3 rounded-xl border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {practiceType === "speaking" && (
                <button className="p-3 rounded-xl bg-secondary text-secondary-foreground hover:bg-accent sidebar-transition">
                  <Mic size={18} />
                </button>
              )}
              <button onClick={handleSend} className="p-3 rounded-xl bg-primary text-primary-foreground hover:opacity-90 sidebar-transition">
                <Send size={18} />
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
};

export default AssistenteIA;
