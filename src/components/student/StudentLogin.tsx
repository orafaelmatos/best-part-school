import { useState, type FormEventHandler } from "react";
import { ArrowRight, Eye, EyeOff, Loader2, LockKeyhole } from "lucide-react";
import { PUBLIC_SITE_URL } from "@/apps/target";

type Props = {
  email: string; password: string; isLoading: boolean;
  onEmailChange: (value: string) => void; onPasswordChange: (value: string) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
};

export default function StudentLogin({ email, password, onEmailChange, onPasswordChange, onSubmit, isLoading }: Props) {
  const [showPassword, setShowPassword] = useState(false);
  return (
    <main className="min-h-[100dvh] bg-[#f6f7fb] px-6 pb-[calc(2rem_+_env(safe-area-inset-bottom))] pt-[calc(2.5rem_+_env(safe-area-inset-top))] text-[#14243a]">
      <div className="mx-auto flex min-h-[calc(100dvh_-_8rem)] w-full max-w-[380px] flex-col justify-center">
        <div className="mb-10 flex items-center gap-3"><img src="/img/bps-logo.png" alt="" className="h-14 w-14 rounded-[18px] border border-slate-100 bg-white p-1.5 shadow-sm" /><span className="leading-tight"><strong className="block text-lg tracking-tight">best part</strong><span className="text-[10px] font-semibold tracking-[0.25em] text-slate-500">SCHOOL</span></span></div>
        <p className="text-[10px] font-bold tracking-[0.16em] text-[#137c78]">BOM TER VOCÊ AQUI</p>
        <h1 className="mt-3 text-[34px] font-bold leading-[1.15] tracking-tight">Seu próximo passo<br />no inglês.</h1>
        <p className="mt-4 max-w-xs text-sm leading-6 text-slate-500">Entre para acompanhar suas aulas e continuar aprendendo no seu ritmo.</p>
        <form className="mt-9 space-y-5" onSubmit={onSubmit}>
          <div><label htmlFor="student-email" className="mb-2 block text-xs font-bold">Seu e-mail</label><input id="student-email" name="username" type="email" autoComplete="username" autoCapitalize="none" autoCorrect="off" inputMode="email" value={email} onChange={(event) => onEmailChange(event.target.value)} required placeholder="voce@exemplo.com" className="h-14 w-full rounded-2xl border border-[#dce2e9] bg-white px-4 text-base text-[#14243a] outline-none transition focus:border-[#137c78] focus:ring-4 focus:ring-[#137c78]/10" /></div>
          <div><label htmlFor="student-password" className="mb-2 block text-xs font-bold">Sua senha</label><div className="relative"><input id="student-password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => onPasswordChange(event.target.value)} required placeholder="Digite sua senha" className="h-14 w-full rounded-2xl border border-[#dce2e9] bg-white py-3 pl-4 pr-14 text-base text-[#14243a] outline-none transition focus:border-[#137c78] focus:ring-4 focus:ring-[#137c78]/10" /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} aria-pressed={showPassword} className="absolute right-1.5 top-1.5 flex h-11 w-11 items-center justify-center rounded-xl text-slate-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#137c78]">{showPassword ? <EyeOff size={19} /> : <Eye size={19} />}</button></div></div>
          <button type="submit" disabled={isLoading} className="flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl bg-[#137c78] px-5 text-sm font-bold text-white shadow-[0_6px_16px_#137c7820] transition hover:bg-[#106b68] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#137c78] disabled:opacity-60">{isLoading ? <><Loader2 size={18} className="animate-spin" />Entrando...</> : <>Entrar na minha conta <ArrowRight size={17} /></>}</button>
        </form>
        <div className="mt-8 flex gap-2.5 rounded-2xl border border-slate-200/80 px-4 py-3"><LockKeyhole size={16} className="mt-0.5 shrink-0 text-slate-400" /><p className="text-xs leading-5 text-slate-500">Precisa recuperar o acesso? {PUBLIC_SITE_URL ? <a href={PUBLIC_SITE_URL} target="_blank" rel="noreferrer" className="font-semibold text-[#137c78] underline underline-offset-2">Fale com a escola.</a> : "Fale com seu professor para receber ajuda."}</p></div>
        <p className="mt-10 text-[10px] font-medium tracking-wide text-slate-400">APRENDA. PRATIQUE. VÁ ALÉM.</p>
      </div>
    </main>
  );
}
