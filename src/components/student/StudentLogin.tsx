import { Link } from "react-router-dom";
import { useState, type FormEventHandler } from "react";
import { ArrowRight, Eye, EyeOff, LockKeyhole } from "lucide-react";

import { LEGAL_PATHS, supportMailto } from "@/lib/privacy";
import { PUBLIC_SITE_URL } from "@/apps/target";
import { Button, TextField, inputClasses } from "@/components/student/ui";
import { cn } from "@/lib/utils";

type Props = {
  email: string; password: string; isLoading: boolean;
  onEmailChange: (value: string) => void; onPasswordChange: (value: string) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
};

export default function StudentLogin({ email, password, onEmailChange, onPasswordChange, onSubmit, isLoading }: Props) {
  const [showPassword, setShowPassword] = useState(false);
  return (
    <main className="min-h-dvh bg-canvas px-gutter pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[calc(2.5rem+env(safe-area-inset-top))] text-ink">
      <div className="mx-auto flex min-h-[calc(100dvh-8rem)] w-full max-w-sm flex-col justify-center">
        <div className="mb-10 flex items-center gap-3">
          <img src="/img/bps-logo-192.png" alt="" className="size-14 rounded-lg border border-line bg-surface p-1.5" />
          <span className="text-h4 text-ink">Best Part School</span>
        </div>
        <p className="text-body font-medium text-primary">Bom ter você aqui</p>
        <h1 className="mt-2 text-h1 text-ink">Seu próximo passo no inglês.</h1>
        <p className="mt-3 text-body-lg text-ink-secondary">Entre para acompanhar suas aulas e continuar aprendendo no seu ritmo.</p>

        <form className="mt-8 space-y-5" onSubmit={onSubmit}>
          <TextField
            id="student-email"
            label="Seu e-mail"
            name="username"
            type="email"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            inputMode="email"
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
            required
            placeholder="voce@exemplo.com"
          />
          <div>
            <label htmlFor="student-password" className="mb-1.5 block text-body font-medium text-ink">Sua senha</label>
            <div className="relative">
              <input
                id="student-password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(event) => onPasswordChange(event.target.value)}
                required
                placeholder="Digite sua senha"
                className={cn(inputClasses, "pr-14")}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                aria-pressed={showPassword}
                className="absolute right-0.5 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-md text-ink-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {showPassword ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
              </button>
            </div>
          </div>
          <Button type="submit" size="lg" fullWidth loading={isLoading} loadingLabel="Entrando…">
            Entrar na minha conta <ArrowRight aria-hidden="true" />
          </Button>
        </form>

        <div className="mt-8 flex gap-3 rounded-lg bg-surface-muted p-4">
          <LockKeyhole size={20} className="mt-0.5 shrink-0 text-ink-secondary" aria-hidden="true" />
          <p className="text-body text-ink">
            Precisa recuperar o acesso?{" "}
            {PUBLIC_SITE_URL
              ? <a href={supportMailto("Recuperação de acesso à conta")} target="_blank" rel="noreferrer" className="font-semibold text-primary underline underline-offset-2">Fale com a escola.</a>
              : "Fale com seu professor para receber ajuda."}
          </p>
        </div>
        <div className="mt-4 flex flex-wrap gap-6 text-body font-semibold text-primary">
          <Link className="inline-flex min-h-11 items-center underline underline-offset-2" to={LEGAL_PATHS.privacy}>Privacidade</Link>
          <Link className="inline-flex min-h-11 items-center underline underline-offset-2" to={LEGAL_PATHS.support}>Suporte</Link>
        </div>
      </div>
    </main>
  );
}
