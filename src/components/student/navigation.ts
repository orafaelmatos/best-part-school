import { APP_PATHS } from "@/lib/routes";

export function getStudentSection(pathname: string) {
  if (pathname === APP_PATHS.dashboard) return "home";
  if (pathname.startsWith(APP_PATHS.lessons) || pathname === APP_PATHS.calendar) return "lessons";
  if (pathname.startsWith(APP_PATHS.aiPractice) || pathname.startsWith(APP_PATHS.interpreter)) return "ai";
  if ([APP_PATHS.profile, APP_PATHS.finance, APP_PATHS.payments, APP_PATHS.marketplace].some((path) => pathname === path)) return "profile";
  return "study";
}
