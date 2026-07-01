import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

type BadgeState = "none" | "default" | "warning" | "danger";

type SidebarBadgeData = {
  homework: {
    count: number;
    pending_homework: number;
    state: BadgeState;
  };
  learned_words: {
    count: number;
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
  default: "bg-white text-slate-900",
  warning: "bg-amber-300 text-slate-950",
  danger: "bg-rose-300 text-slate-950",
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
    <span
      className={`ml-auto inline-flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-[11px] font-bold tabular-nums shadow-sm ${stateClass[state || "default"]}`}
    >
      {display}
    </span>
  );
};

export default SidebarBadge;
