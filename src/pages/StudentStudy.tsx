import { ArrowUpRight, BookText, ClipboardList, Gamepad2, Headphones, MessageCircle } from "lucide-react";
import { Navigate, Link } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useSidebarBadges } from "@/components/SidebarBadges";
import { APP_PATHS } from "@/lib/routes";

export default function StudentStudy() {
  const { user } = useAuth();
  const { data: badges } = useSidebarBadges(user?.role === "student");
  if (user?.role !== "student") return <Navigate to={APP_PATHS.dashboard} replace />;
  const activities = [
    { label: "Atividades da aula", detail: "Faça as tarefas e veja o feedback do professor.", path: APP_PATHS.homework, icon: ClipboardList, color: "#137c78", bg: "#e7f3ef", count: badges?.homework?.count, countLabel: "pendentes" },
    { label: "Meu vocabulário", detail: "Revise suas palavras e pratique com flashcards.", path: APP_PATHS.learnedWords, icon: BookText, color: "#806333", bg: "#fbf0d9", count: badges?.learned_words?.count, countLabel: "para revisar" },
    { label: "Jogo de palavras", detail: "Teste o que você já aprendeu de um jeito diferente.", path: APP_PATHS.vocabularyGame, icon: Gamepad2, color: "#61528e", bg: "#f0ecf9" },
  ];
  return (
    <DashboardLayout>
      <div className="space-y-7">
        <div><p className="student-eyebrow">UM PASSO POR DIA</p><h1 className="mt-2 text-[29px] font-bold leading-tight tracking-tight">O que vamos<br />praticar hoje?</h1><p className="mt-3 max-w-md text-sm leading-6 text-slate-500">Continue as atividades das aulas ou escolha uma prática para o seu momento.</p></div>
        <section aria-labelledby="study-activities" className="space-y-3">
          <h2 id="study-activities" className="text-base font-bold">Seu estudo</h2>
          {activities.map(({ label, detail, path, icon: Icon, color, bg, count, countLabel }) => (
            <Link key={path} to={path} className="student-card flex min-h-[112px] items-start gap-4 p-5 transition-colors hover:border-slate-300">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl" style={{ background: bg, color }}><Icon size={23} strokeWidth={1.8} /></span>
              <div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><h3 className="text-[15px] font-bold">{label}</h3><ArrowUpRight size={16} className="shrink-0 text-slate-400" /></div><p className="mt-1.5 text-xs leading-5 text-slate-500">{detail}</p>{Boolean(count) && <span className="mt-3 inline-flex rounded-full bg-[#edf4f1] px-2.5 py-1 text-[10px] font-bold text-[#137c78]">{count} {count === 1 && countLabel === "pendentes" ? "pendente" : countLabel}</span>}</div>
            </Link>
          ))}
        </section>
        <section aria-labelledby="study-ai"><div className="mb-3 flex items-center gap-2"><h2 id="study-ai" className="text-base font-bold">Pratique com IA</h2><span className="rounded-md bg-[#e7f3ef] px-1.5 py-0.5 text-[9px] font-bold text-[#137c78]">NO SEU RITMO</span></div>
          <div className="grid grid-cols-2 gap-3">
            <Link to={APP_PATHS.aiPractice} className="student-card p-4"><MessageCircle size={24} className="text-[#137c78]" /><h3 className="mt-5 text-sm font-bold">Conversar e escrever</h3><p className="mt-2 text-xs leading-5 text-slate-500">Speaking, escrita e revisão guiada.</p><span className="mt-4 inline-flex min-h-11 items-center gap-2 text-xs font-bold text-[#137c78]">Começar <ArrowUpRight size={15} /></span></Link>
            <Link to={APP_PATHS.interpreter} className="student-card p-4"><Headphones size={24} className="text-[#806333]" /><h3 className="mt-5 text-sm font-bold">Ouvir e entender</h3><p className="mt-2 text-xs leading-5 text-slate-500">Listening em situações do dia a dia.</p><span className="mt-4 inline-flex min-h-11 items-center gap-2 text-xs font-bold text-[#806333]">Começar <ArrowUpRight size={15} /></span></Link>
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
