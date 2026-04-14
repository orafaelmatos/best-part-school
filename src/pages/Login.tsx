import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { useNavigate } from "react-router-dom";
import { BookOpen, User, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

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
      navigate("/");
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Erro ao fazer login",
        description: err.response?.data?.detail || "Email ou senha incorretos.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-100">
        <div className="p-8 text-center border-b border-gray-50 bg-primary/5">
          <div className="w-16 h-16 bg-primary text-primary-foreground rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-md rotate-[-5deg] hover:rotate-0 transition-transform">
            <BookOpen size={32} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Best Part School</h1>
          <p className="text-sm text-gray-500 mt-2 font-medium">Acesso a Alunos e Professores</p>
        </div>

        <div className="p-8">
          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-gray-700">Email</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <User size={18} />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  placeholder="professor@bps.com"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-gray-700">Senha</label>
                <a href="#" className="text-xs text-primary font-medium hover:underline">Esqueceu a senha?</a>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <Lock size={18} />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-primary hover:opacity-90 text-primary-foreground font-semibold py-2.5 rounded-xl shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {isLoading ? "Entrando..." : "Acessar Plataforma"}
            </button>
          </form>

          <div className="mt-8 text-center border-t border-gray-100 pt-6">
            <p className="text-sm text-gray-500">
              Não tem uma conta?{" "}
              <a href="#" className="text-primary font-semibold hover:underline">Entre em contato</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;