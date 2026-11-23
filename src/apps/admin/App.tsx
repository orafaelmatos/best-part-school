import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import PrivateRoute from "@/components/PrivateRoute";
import Login from "@/pages/Login";
import NotFound from "@/pages/NotFound";
import { APP_PATHS, LOGIN_PATH } from "@/lib/routes";
import AppProviders from "../AppProviders";
import { accountPaths, accountRoutes } from "../shared/accountRoutes";
import { legacyRedirectRoutes } from "../shared/redirects";
import { adminPaths, adminRoutes } from "./routes";
import { commercePaths, commerceRoutes } from "../shared/commerceRoutes";
import { legalRoutes } from "../shared/legalRoutes";

export function AdminRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to={APP_PATHS.dashboard} replace />} />
      <Route path={LOGIN_PATH} element={<Login />} />
      {legalRoutes()}
      {legacyRedirectRoutes([...accountPaths, ...commercePaths, ...adminPaths, APP_PATHS.lessons])}
      <Route element={<PrivateRoute allowedRoles={["teacher", "admin"]} />}>
        {accountRoutes()}
        {commerceRoutes()}
        {adminRoutes()}
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default function AdminApp() {
  return <AppProviders><BrowserRouter><AuthProvider><AdminRoutes /></AuthProvider></BrowserRouter></AppProviders>;
}
