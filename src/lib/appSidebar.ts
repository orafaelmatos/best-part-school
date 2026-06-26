export const DEFAULT_SIDEBAR_WIDTH_CLASS = "w-64";
export const DEFAULT_MAIN_OFFSET_CLASS = "ml-64";

export const AI_WORKSPACE_SIDEBAR_WIDTH_CLASS = "w-[23rem]";
export const AI_WORKSPACE_MAIN_OFFSET_CLASS = "ml-[23rem]";

export const isAiWorkspacePath = (pathname: string) =>
  pathname === "/treinar-ia" || pathname.startsWith("/treinar-ia/");
