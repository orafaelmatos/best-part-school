import { Route } from "react-router-dom";
import LandingPage from "@/pages/LandingPage";
import { PUBLIC_PATHS } from "@/lib/routes";

export function publicRoutes() {
  return Object.values(PUBLIC_PATHS).map((path) => (
    <Route key={path} path={path} element={<LandingPage />} />
  ));
}
