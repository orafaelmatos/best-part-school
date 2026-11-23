import { Route } from "react-router-dom";
import Marketplace from "@/pages/Marketplace";
import Pagamentos from "@/pages/Pagamentos";
import { APP_PATHS } from "@/lib/routes";

export const commercePaths = [APP_PATHS.marketplace, APP_PATHS.finance, APP_PATHS.payments];

export function commerceRoutes() {
  return [
    <Route key="marketplace" path={APP_PATHS.marketplace} element={<Marketplace />} />,
    <Route key="finance" path={APP_PATHS.finance} element={<Pagamentos />} />,
    <Route key="payments" path={APP_PATHS.payments} element={<Pagamentos />} />,
  ];
}
