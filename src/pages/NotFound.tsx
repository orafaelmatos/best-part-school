import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { APP_PATHS, LANDING_PATH } from "@/lib/routes";
import { APP_TARGET } from "@/apps/target";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-gutter text-ink">
      <div className="text-center">
        <h1 className="text-display text-ink">404</h1>
        <p className="mt-2 text-body-lg text-ink-secondary">Página não encontrada</p>
        <Link to={APP_TARGET === "student" || APP_TARGET === "admin" ? APP_PATHS.dashboard : LANDING_PATH} className="mt-4 inline-flex min-h-11 items-center text-body font-semibold text-primary underline underline-offset-2">
          Voltar ao início
        </Link>
      </div>
    </main>
  );
};

export default NotFound;
