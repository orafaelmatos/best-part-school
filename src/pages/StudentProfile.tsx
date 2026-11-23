import { useRef, type ChangeEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate } from "react-router-dom";
import { Camera, ChevronRight, CreditCard, ExternalLink, HelpCircle, Loader2, LogOut, ShoppingBag } from "lucide-react";
import axios from "axios";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useStudentProfile, studentInitials } from "@/components/student/useStudentProfile";
import { useSidebarBadges } from "@/components/SidebarBadges";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { absoluteMediaUrl } from "@/lib/config";
import { APP_PATHS } from "@/lib/routes";
import { LEGAL_PATHS } from "@/lib/privacy";
import { PUBLIC_SITE_URL, APP_TARGET } from "@/apps/target";
import StudentPrivacyPanel from "@/components/student/StudentPrivacyPanel";

export default function StudentProfile() {
  const { user, logout } = useAuth();
  const query = useStudentProfile();
  const { data: badges } = useSidebarBadges(user?.role === "student" && APP_TARGET !== "student");
  const input = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const upload = useMutation({
    mutationFn: async (file: File) => { const data = new FormData(); data.append("photo", file); await api.patch(`/accounts/users/${user?.user_id}/`, data); },
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["current-user-profile", user?.user_id] }); toast({ title: "Foto atualizada" }); },
    onError: (error) => { const message = axios.isAxiosError(error) ? error.response?.data?.photo?.[0] : undefined; toast({ title: "Não foi possível atualizar a foto", description: message || "Verifique sua conexão e tente novamente.", variant: "destructive" }); },
  });
  const onPhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024) {
      toast({ title: "Escolha outra imagem", description: "Use uma foto JPG, PNG ou WebP de até 8 MB.", variant: "destructive" }); return;
    }
    upload.mutate(file);
  };
  if (user?.role !== "student") return <Navigate to={APP_PATHS.dashboard} replace />;
  const name = query.data?.name || user.name || "Aluno";
  const photo = absoluteMediaUrl(query.data?.photo_url);
  return (
    <DashboardLayout>
      <div className="space-y-7">
        <h1 className="text-[28px] font-bold tracking-tight">Seu espaço.</h1>
        <section className="student-card p-6 text-center" aria-label="Informações da conta">
          <div className="relative mx-auto w-fit"><div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-[#e4efee] text-2xl font-bold text-[#137c78] ring-1 ring-[#d9e5e2]">{photo ? <img src={photo} alt="Sua foto" className="h-full w-full object-cover" /> : studentInitials(name)}</div><button disabled={upload.isPending} type="button" onClick={() => input.current?.click()} aria-label="Alterar foto de perfil" className="absolute -bottom-1 -right-2 flex h-11 w-11 items-center justify-center rounded-full border-4 border-white bg-[#14243a] text-white disabled:opacity-60">{upload.isPending ? <Loader2 size={17} className="animate-spin" /> : <Camera size={17} />}</button></div>
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" onChange={onPhoto} className="hidden" aria-label="Selecionar nova foto" />
          <h2 className="mt-5 text-xl font-bold">{name}</h2><p className="mt-1 break-all text-sm text-slate-500">{query.data?.email || user.email}</p>{(query.data?.level || user.level) && <span className="mt-4 inline-flex rounded-full bg-[#e7f3ef] px-3 py-1.5 text-xs font-semibold text-[#137c78]">Inglês · Nível {query.data?.level || user.level}</span>}
          {query.isError && <button type="button" onClick={() => void query.refetch()} className="mt-4 block min-h-11 w-full text-sm font-semibold text-[#137c78]">Não carregamos seu perfil. Tentar novamente</button>}
        </section>
        {APP_TARGET !== "student" && <section aria-labelledby="profile-account"><h2 id="profile-account" className="mb-3 text-sm font-bold">Sua conta</h2><div className="student-card divide-y divide-slate-100 overflow-hidden">
          <Link to={APP_PATHS.finance} className="flex min-h-[76px] items-center gap-4 px-5 py-4"><CreditCard size={21} className="shrink-0 text-slate-500" /><div className="flex-1"><span className="text-sm font-bold">Financeiro</span><p className="mt-1 text-xs text-slate-500">Pagamentos e contratos</p></div>{Boolean(badges?.finance?.count) && <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-800">{badges.finance.count}</span>}<ChevronRight size={17} className="text-slate-400" /></Link>
          <Link to={APP_PATHS.marketplace} className="flex min-h-[76px] items-center gap-4 px-5 py-4"><ShoppingBag size={21} className="shrink-0 text-slate-500" /><div className="flex-1"><span className="text-sm font-bold">Cursos e materiais</span><p className="mt-1 text-xs text-slate-500">Explore o catálogo da escola</p></div><ChevronRight size={17} className="text-slate-400" /></Link>
        </div></section>}
        <StudentPrivacyPanel />
        <section className="student-card flex items-start gap-3 p-5"><HelpCircle size={21} className="mt-0.5 shrink-0 text-[#137c78]" /><div><h2 className="text-sm font-bold">Precisa de uma mão?</h2><p className="mt-1.5 text-xs leading-5 text-slate-500">Fale com seu professor para tirar dúvidas sobre aulas ou acesso à conta.</p>{APP_TARGET === "student" ? <Link to={LEGAL_PATHS.support} className="mt-2 inline-flex min-h-11 items-center gap-2 text-xs font-bold text-[#137c78]">Falar com o suporte <HelpCircle size={14} /></Link> : PUBLIC_SITE_URL && <a href={PUBLIC_SITE_URL} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-11 items-center gap-2 text-xs font-bold text-[#137c78]">Visitar o site da escola <ExternalLink size={14} /></a>}</div></section>
        <button type="button" onClick={() => void logout()} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-600"><LogOut size={17} />Sair da conta</button>
        <p className="pb-2 text-center text-[10px] font-medium tracking-wide text-slate-400">BEST PART SCHOOL · SEU INGLÊS, DO SEU JEITO</p>
      </div>
    </DashboardLayout>
  );
}
