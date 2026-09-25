import { api } from "@/lib/api";
import { API_BASE_URL } from "@/lib/config";

type QueryParams = Record<string, string | number | boolean | undefined | null>;

const getRuntimeOrigin = () =>
  typeof window !== "undefined" && window.location?.origin ? window.location.origin : "http://localhost";

const normalizeNextUrl = (value?: string | null) => {
  if (!value) return null;

  try {
    const apiBase = new URL(API_BASE_URL, getRuntimeOrigin());
    const next = new URL(value, apiBase);
    const apiPath = apiBase.pathname.replace(/\/+$/, "");
    const nextPath = apiPath && next.pathname.startsWith(`${apiPath}/`)
      ? next.pathname.slice(apiPath.length)
      : next.pathname;
    return `${nextPath || "/"}${next.search}`;
  } catch {
    return value;
  }
};

export const fetchAllPages = async <T>(url: string, params?: QueryParams) => {
  const items: T[] = [];
  let nextUrl: string | null = url;
  let nextParams = params;

  while (nextUrl) {
    const response = await api.get(nextUrl, nextParams ? { params: nextParams } : undefined);
    const data = response.data;

    if (Array.isArray(data)) {
      items.push(...data);
      break;
    }

    items.push(...(Array.isArray(data?.results) ? data.results : []));
    nextUrl = normalizeNextUrl(data?.next);
    nextParams = undefined;
  }

  return items;
};
