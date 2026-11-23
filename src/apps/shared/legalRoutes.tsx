import { Route } from "react-router-dom";
import LegalPage from "@/pages/LegalPage";
import { LEGAL_PATHS } from "@/lib/privacy";

export function legalRoutes() {
  return Object.values(LEGAL_PATHS).map((path) => <Route key={path} path={path} element={<LegalPage />} />);
}
