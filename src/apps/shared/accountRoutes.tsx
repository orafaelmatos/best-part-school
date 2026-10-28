import { Route } from "react-router-dom";
import Dashboard from "@/pages/Dashboard";
import PalavrasAprendidas from "@/pages/PalavrasAprendidas";
import Marketplace from "@/pages/Marketplace";
import Pagamentos from "@/pages/Pagamentos";
import { APP_PATHS } from "@/lib/routes";

export const accountPaths = [APP_PATHS.dashboard, APP_PATHS.learnedWords, APP_PATHS.marketplace, APP_PATHS.finance, APP_PATHS.payments];

export function accountRoutes() {
  return [
    <Route key="dashboard" path={APP_PATHS.dashboard} element={<Dashboard />} />,
    <Route key="learnedWords" path={APP_PATHS.learnedWords} element={<PalavrasAprendidas />} />,
    <Route key="marketplace" path={APP_PATHS.marketplace} element={<Marketplace />} />,
    <Route key="finance" path={APP_PATHS.finance} element={<Pagamentos />} />,
    <Route key="payments" path={APP_PATHS.payments} element={<Pagamentos />} />,
  ];
}
