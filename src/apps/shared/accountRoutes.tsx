import { Route } from "react-router-dom";
import Dashboard from "@/pages/Dashboard";
import PalavrasAprendidas from "@/pages/PalavrasAprendidas";
import { APP_PATHS } from "@/lib/routes";

export const accountPaths = [APP_PATHS.dashboard, APP_PATHS.learnedWords];

export function accountRoutes() {
  return [
    <Route key="dashboard" path={APP_PATHS.dashboard} element={<Dashboard />} />,
    <Route key="learnedWords" path={APP_PATHS.learnedWords} element={<PalavrasAprendidas />} />,
  ];
}
