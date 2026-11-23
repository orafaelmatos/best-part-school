import { Capacitor } from "@capacitor/core";
import { requireHttpsUrl } from "./buildConfig";
import { isLocalDevelopmentOrigin } from "./localDevelopment";

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
  const fallback =
    typeof window !== "undefined" && window.location.hostname
      ? `${window.location.protocol}//${window.location.hostname}:8000/api/`
      : "http://localhost:8000/api/";
  const trimmed = (value || fallback).trim();
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
};

const normalizeBaseUrl = (value?: string) => {
  const fallback =
    typeof window !== "undefined" && window.location.hostname
      ? `${window.location.protocol}//${window.location.hostname}:8000`
      : "http://localhost:8000";
  return (value || fallback).trim().replace(/\/+$/, "");
};

const defaultApiUrl = import.meta.env.VITE_API_URL;
const defaultMediaBaseUrl = import.meta.env.VITE_MEDIA_BASE_URL;
export const USE_LOCAL_API = import.meta.env.VITE_LOCAL_API === "1";
const origin = typeof window !== "undefined" ? window.location.origin : "";

// This branch ignores both runtime configuration and .env remote URLs.
if (USE_LOCAL_API && (!import.meta.env.DEV || !isLocalDevelopmentOrigin(origin))) {
  throw new Error("A API local só pode ser usada pelo servidor de desenvolvimento. Execute npm run mobile:live:ios:local.");
}

// Packaged apps must never silently resolve the API to their own local WebView.
if (Capacitor.isNativePlatform() && !USE_LOCAL_API) {
  requireHttpsUrl(runtimeConfig.VITE_API_URL || defaultApiUrl, "VITE_API_URL");
  const mediaUrl = runtimeConfig.VITE_MEDIA_BASE_URL || defaultMediaBaseUrl;
  if (mediaUrl) requireHttpsUrl(mediaUrl, "VITE_MEDIA_BASE_URL");
}

export const API_BASE_URL = USE_LOCAL_API ? `${origin}/api/` : normalizeApiUrl(runtimeConfig.VITE_API_URL || defaultApiUrl);
export const MEDIA_BASE_URL = USE_LOCAL_API ? origin : normalizeBaseUrl(
  runtimeConfig.VITE_MEDIA_BASE_URL || defaultMediaBaseUrl || API_BASE_URL.replace(/\/api\/?$/, ""),
);

export const absoluteMediaUrl = (url?: string | null) => {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return `${MEDIA_BASE_URL}${url.startsWith("/") ? url : `/${url}`}`;
};
