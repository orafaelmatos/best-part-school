export type AppTarget = "legacy" | "site" | "admin" | "student";

const configuredTarget = import.meta.env.VITE_APP_TARGET || "legacy";

if (!["legacy", "site", "admin", "student"].includes(configuredTarget)) {
  throw new Error(`Invalid VITE_APP_TARGET: ${configuredTarget}`);
}

export const APP_TARGET = configuredTarget as AppTarget;

// Separate deployments must opt into links to the other applications.
export const PUBLIC_SITE_URL = import.meta.env.VITE_PUBLIC_SITE_URL?.trim() || undefined;
export const STUDENT_APP_URL = import.meta.env.VITE_STUDENT_APP_URL?.trim() || undefined;
