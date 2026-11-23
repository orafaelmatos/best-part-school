import { isAxiosError } from 'axios';

function firstMessage(value: unknown): string | undefined {
  if (typeof value === 'string' && !value.trim().startsWith('<')) return value;
  if (Array.isArray(value)) return value.map(firstMessage).find(Boolean);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return firstMessage(record.detail ?? record.error ?? record.message ?? record.non_field_errors) || Object.values(record).map(firstMessage).find(Boolean);
  }
}
export function apiErrorMessage(error: unknown, fallback = 'Não foi possível concluir. Verifique os dados e tente novamente.'): string {
  return isAxiosError(error) ? firstMessage(error.response?.data) || fallback : fallback;
}
