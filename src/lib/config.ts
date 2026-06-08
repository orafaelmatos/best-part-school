type RuntimeConfig = {
  VITE_API_URL?: string;
  VITE_MEDIA_BASE_URL?: string;
};

declare global {
  interface Window {
    __APP_CONFIG__?: RuntimeConfig;
  }
}

const runtimeConfig = typeof window !== "undefined" ? window.__APP_CONFIG__ ?? {} : {};

const normalizeApiUrl = (value?: string) => {
  const fallback = "http://localhost:8000/api/";
  const trimmed = (value || fallback).trim();
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
};

const normalizeBaseUrl = (value?: string) => {
  const fallback = "http://localhost:8000";
  return (value || fallback).trim().replace(/\/+$/, "");
};

const defaultApiUrl = import.meta.env.VITE_API_URL;
const defaultMediaBaseUrl = import.meta.env.VITE_MEDIA_BASE_URL;

export const API_BASE_URL = normalizeApiUrl(runtimeConfig.VITE_API_URL || defaultApiUrl);
export const MEDIA_BASE_URL = normalizeBaseUrl(
  runtimeConfig.VITE_MEDIA_BASE_URL || defaultMediaBaseUrl || API_BASE_URL.replace(/\/api\/?$/, ""),
);

export const absoluteMediaUrl = (url?: string | null) => {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return `${MEDIA_BASE_URL}${url.startsWith("/") ? url : `/${url}`}`;
};
