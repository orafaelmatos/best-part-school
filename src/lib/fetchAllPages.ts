import { api } from "@/lib/api";

type QueryParams = Record<string, string | number | boolean | undefined | null>;

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
    nextUrl = data?.next || null;
    nextParams = undefined;
  }

  return items;
};
