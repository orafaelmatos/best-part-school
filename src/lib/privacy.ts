export const PRIVACY_VERSION = "2026-11-23";
export const ORGANIZATION_NAME = import.meta.env.VITE_ORGANIZATION_NAME?.trim() || "Best Part School";
export const ORGANIZATION_ID = import.meta.env.VITE_ORGANIZATION_ID?.trim();
export const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL?.trim() || "gabriel@bestpartschol.com";
export const LEGAL_PATHS = { privacy: "/privacidade", support: "/suporte", deletion: "/excluir-conta" } as const;
export const supportMailto = (subject = "Suporte ao aplicativo Best Part School") =>
  `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;
