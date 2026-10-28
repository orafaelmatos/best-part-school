import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import PrivateRoute from "@/components/PrivateRoute";
import Login from "@/pages/Login";
import NotFound from "@/pages/NotFound";
import { LOGIN_PATH } from "@/lib/routes";
import AppProviders from "../AppProviders";
import { accountPaths, accountRoutes } from "../shared/accountRoutes";
import { legacyRedirectRoutes } from "../shared/redirects";
import { studentPaths, studentRoutes } from "../student/routes";
import { adminPaths, adminRoutes } from "../admin/routes";
import { publicRoutes } from "../site/routes";

export default function LegacyApp() {
  return (
    <AppProviders>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {publicRoutes()}
            <Route path={LOGIN_PATH} element={<Login />} />
            {legacyRedirectRoutes([...accountPaths, ...studentPaths, ...adminPaths])}
            <Route element={<PrivateRoute />}>
              {accountRoutes()}
              {studentRoutes({ includeCalendarAlias: false })}
              {adminRoutes({ includeLessonsAlias: false })}
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </AppProviders>
  );
}
