import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { LOGIN_PATH } from "@/lib/routes";

const PrivateRoute = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center text-primary font-medium">Carregando BPS...</div>;
  }

  return user ? <Outlet /> : <Navigate to={LOGIN_PATH} replace />;
};

export default PrivateRoute;
