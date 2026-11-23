import { Navigate, Route, useLocation } from "react-router-dom";

function LegacyPathRedirect() {
  const { pathname, search, hash } = useLocation();
  return <Navigate to={`/app${pathname}${search}${hash}`} replace />;
}

// Preserve bookmarked pre-/app URLs, including queries and dynamic parameters.
export function legacyRedirectRoutes(paths: readonly string[]) {
  return paths.filter((path) => path !== "/app").map((path) => (
    <Route key={`legacy-${path}`} path={path.slice(4)} element={<LegacyPathRedirect />} />
  ));
}
