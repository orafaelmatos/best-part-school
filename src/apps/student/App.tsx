import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import PrivateRoute from "@/components/PrivateRoute";
import NativeAppLifecycle from "@/components/NativeAppLifecycle";
import NativeExternalLinks from "@/components/NativeExternalLinks";
import { legalRoutes } from "../shared/legalRoutes";
import Login from "@/pages/Login";
import NotFound from "@/pages/NotFound";
import { APP_PATHS, LOGIN_PATH } from "@/lib/routes";
import AppProviders from "../AppProviders";
import { accountPaths, accountRoutes } from "../shared/accountRoutes";
import { legacyRedirectRoutes } from "../shared/redirects";
import { studentPaths, studentRoutes } from "./routes";

export function StudentRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to={APP_PATHS.dashboard} replace />} />
      <Route path={LOGIN_PATH} element={<Login />} />
      {legalRoutes()}
      {legacyRedirectRoutes([...accountPaths, ...studentPaths, APP_PATHS.calendar])}
      <Route element={<PrivateRoute allowedRoles={["student"]} />}>
        {accountRoutes()}
        {studentRoutes()}
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default function StudentApp() {
  return (
    <AppProviders>
      <HashRouter>
        <AuthProvider>
          <NativeAppLifecycle />
          <NativeExternalLinks />
          <StudentRoutes />
        </AuthProvider>
      </HashRouter>
    </AppProviders>
  );
}
