import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

type BadgeState = "none" | "default" | "warning" | "danger";

type SidebarBadgeData = {
  homework: {
    count: number;
    pending_homework: number;
    overdue_reviews: number;
    difficult_cards: number;
    state: BadgeState;
  };
  finance: {
    count: number;
    state: BadgeState;
  };
};

const stateClass: Record<BadgeState, string> = {
  none: "",
  default: "bg-primary text-primary-foreground",
  warning: "bg-amber-500 text-white",
  danger: "bg-red-600 text-white",
};

export const useSidebarBadges = (enabled = true) => {
  return useQuery({
    queryKey: ["sidebar-badges"],
    queryFn: async () => {
      const res = await api.get("/sidebar-badges/");
      return res.data as SidebarBadgeData;
    },
    enabled,
    refetchInterval: 45_000,
    staleTime: 20_000,
  });
};

const SidebarBadge = ({ count, state }: { count?: number; state?: BadgeState }) => {
  if (!count) return null;
  const display = count > 99 ? "99+" : count;
  return (
    <span className={`ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-md px-1.5 text-xs font-semibold tabular-nums ${stateClass[state || "default"]}`}>
      {display}
    </span>
  );
};

export default SidebarBadge;
