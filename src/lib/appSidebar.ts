import { APP_PATHS } from "@/lib/routes";

export const DEFAULT_SIDEBAR_WIDTH_CLASS = "lg:w-80";
export const DEFAULT_MAIN_OFFSET_CLASS = "lg:ml-80";

export const AI_WORKSPACE_SIDEBAR_WIDTH_CLASS = DEFAULT_SIDEBAR_WIDTH_CLASS;
export const AI_WORKSPACE_MAIN_OFFSET_CLASS = DEFAULT_MAIN_OFFSET_CLASS;

export const isAiWorkspacePath = (pathname: string) =>
  pathname === APP_PATHS.aiPractice ||
  pathname.startsWith(`${APP_PATHS.aiPractice}/`) ||
  pathname === APP_PATHS.interpreter ||
  pathname.startsWith(`${APP_PATHS.interpreter}/`);
