import { api } from "@/lib/api";

export type MarketplaceCourse = {
  id: string | number;
  title?: string;
  description?: string;
  price?: string | number | null;
  is_free?: boolean;
  isFree?: boolean;
  is_discounted?: boolean;
  discount_price?: string | number | null;
};

const toNumber = (value: string | number | null | undefined) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const normalizeCourseList = (data: unknown): MarketplaceCourse[] => {
  if (Array.isArray(data)) return data as MarketplaceCourse[];

  if (
    data &&
    typeof data === "object" &&
    "results" in data &&
    Array.isArray((data as { results?: unknown }).results)
  ) {
    return (data as { results: MarketplaceCourse[] }).results;
  }

  return [];
};

export const fetchCourses = async () => {
  const response = await api.get("courses/");
  return normalizeCourseList(response.data);
};

export const isFreeCourse = (course: MarketplaceCourse) => Boolean(course.is_free ?? course.isFree);

export const isPaidCourse = (course: MarketplaceCourse) =>
  !isFreeCourse(course) && (toNumber(course.price) > 0 || toNumber(course.discount_price) > 0);

export const getDisplayPrice = (course: MarketplaceCourse) => {
  if (course.is_discounted && course.discount_price) return toNumber(course.discount_price);
  return toNumber(course.price);
};

export const getOriginalPrice = (course: MarketplaceCourse) => {
  if (!course.is_discounted || !course.discount_price) return null;
  return toNumber(course.price);
};

export const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
