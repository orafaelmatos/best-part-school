import { useState } from "react";
import type { AxiosError } from "axios";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { Navigate, useNavigate } from "react-router-dom";
import { User, Lock, ArrowRight, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { APP_PATHS } from "@/lib/routes";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { login, user, isLoading: isAuthLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  if (isAuthLoading) {
    return <div className="min-h-screen flex items-center justify-center text-primary font-medium">Carregando BPS...</div>;
  }

  if (user) {
    return <Navigate to={APP_PATHS.dashboard} replace />;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const response = await api.post("/accounts/login/", {
        email,
        password,
      });
      const { access } = response.data;
      login(access);
      toast({
        title: "Login efetuado com sucesso!",
        description: "Bem vindo ao BPS Connect Hub.",
      });
      navigate(APP_PATHS.dashboard);
    } catch (err) {
      const error = err as AxiosError<{ detail?: string }>;
      toast({
        variant: "destructive",
        title: "Erro ao fazer login",
        description: error.response?.data?.detail || "Email ou senha incorretos.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,#203b71_0%,#18243c_34%,#0f172a_100%)] p-4">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.16),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(16,185,129,0.14),transparent_30%)]" />
      <div className="relative mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-6xl items-center justify-center">
        <div className="grid w-full max-w-5xl overflow-hidden rounded-[32px] border border-white/10 bg-white/6 shadow-[0_30px_90px_-40px_rgba(15,23,42,0.95)] backdrop-blur xl:grid-cols-[1.05fr_0.95fr]">
          <section className="relative hidden min-h-[680px] overflow-hidden border-r border-white/10 p-10 text-white xl:flex xl:flex-col xl:justify-between">
            <div className="absolute inset-0 bg-[linear-gradient(145deg,rgba(59,130,246,0.16),rgba(15,23,42,0.08)_48%,rgba(16,185,129,0.16))]" />
            <div className="relative">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-100">
                <Sparkles className="h-3.5 w-3.5" />
                Portal BPS
              </div>
              <img
                src="/img/bps-logo.png"
                alt="Best Part School"
                className="mt-8 h-20 w-20 rounded-[24px] bg-white p-3 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.7)]"
              />
              <h1 className="mt-8 max-w-md text-4xl font-semibold tracking-tight">
                Best Part School
              </h1>
              <p className="mt-4 max-w-xl text-base leading-8 text-slate-200">
                Uma escola criada para transformar estudo em evolução consistente <br></br>
                A Best Part School combina ensino humano, estrutura clara e tecnologia para que cada aluno avance com confiança, sem perder tempo com conteúdos genéricos.
              </p>
            </div>

            <div className="relative grid gap-4">
              <div className="rounded-[26px] border border-white/10 bg-white/8 p-5">
                <p className="text-sm font-semibold text-white">Acesso para alunos e professores</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Continue de onde parou, acompanhe sua trilha e entre direto nas praticas com IA.
                </p>
              </div>
            </div>
          </section>

          <section className="bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(248,250,252,0.98))] p-6 sm:p-8 xl:p-10">
            <div className="mx-auto flex h-full w-full max-w-md flex-col justify-center">
              <div className="xl:hidden">
                <img
                  src="/img/bps-logo.png"
                  alt="Best Part School"
                  className="h-16 w-16 rounded-[20px] bg-white p-2.5 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.28)]"
                />
              </div>

              <div className="mt-6 xl:mt-0">
                <p className="text-xs font-semibold uppercase tracking-[0.26em] text-sky-700">
                  Acesso a plataforma
                </p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
                  Entrar na sua conta
                </h2>
                <p className="mt-3 text-sm leading-7 text-slate-600">
                  Use seu email e senha para acessar o portal da escola.
                </p>
              </div>

              <form onSubmit={handleLogin} className="mt-8 space-y-5">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Email</label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                      <User size={18} />
                    </div>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="w-full rounded-2xl border border-slate-200 bg-white/90 py-3 pl-10 pr-4 text-sm text-slate-900 shadow-sm transition-all focus:border-sky-300 focus:bg-white focus:outline-none focus:ring-4 focus:ring-sky-100"
                      placeholder="aluno@bestpartschool.com"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-semibold text-slate-700">Senha</label>
                    <a href="#" className="text-xs font-medium text-sky-700 transition hover:text-sky-800 hover:underline">
                      Esqueceu a senha?
                    </a>
                  </div>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                      <Lock size={18} />
                    </div>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="w-full rounded-2xl border border-slate-200 bg-white/90 py-3 pl-10 pr-4 text-sm text-slate-900 shadow-sm transition-all focus:border-sky-300 focus:bg-white focus:outline-none focus:ring-4 focus:ring-sky-100"
                      placeholder="••••••••"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_38px_-24px_rgba(15,23,42,0.5)] transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span>{isLoading ? "Entrando..." : "Acessar plataforma"}</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </form>

              <div className="mt-8 rounded-[24px] border border-slate-200/80 bg-slate-50/80 p-4">
                <p className="text-sm font-medium text-slate-700">
                  Nao tem uma conta?
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  Entre em contato com a escola para receber seus dados de acesso.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default Login;
