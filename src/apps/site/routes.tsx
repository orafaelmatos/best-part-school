import { Route } from "react-router-dom";
import LandingPage from "@/pages/LandingPage";
import { PUBLIC_PATHS } from "@/lib/routes";
import { legalRoutes } from "../shared/legalRoutes";

export function publicRoutes() {
  return [...legalRoutes(), ...Object.values(PUBLIC_PATHS).map((path) => (
    <Route key={path} path={path} element={<LandingPage />} />
  ))];
}
