import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { LOGIN_PATH } from "@/lib/routes";

const PrivateRoute = ({ allowedRoles }: { allowedRoles?: readonly string[] }) => {
  const { user, isLoading, logout } = useAuth();

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center text-primary font-medium">Carregando BPS...</div>;
  }

  if (!user) return <Navigate to={LOGIN_PATH} replace />;

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-950">Use a conta deste portal</h1>
          <p className="mt-3 text-slate-600">
            {allowedRoles.includes("student")
              ? "Este aplicativo é exclusivo para alunos. Entre com sua conta de aluno."
              : "Este painel é exclusivo para professores e administradores."}
          </p>
          <button type="button" onClick={logout} className="mt-6 rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white">
            Sair e trocar de conta
          </button>
        </div>
      </main>
    );
  }

  return <Outlet />;
};

export default PrivateRoute;
