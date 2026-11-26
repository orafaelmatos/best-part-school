/**
 * Token values for code that cannot read CSS variables (charts, canvas,
 * native status bar). Keep in sync with src/design-system/tokens.css.
 * In JSX and CSS, prefer the Tailwind classes documented in docs/design-system.
 */
export const colors = {
  primary: "#2563EB",
  primaryDark: "#1E40AF",
  primaryDeep: "#172554",
  primaryMedium: "#3B82F6",
  primarySoft: "#93C5FD",
  primaryLight: "#DBEAFE",
  primarySubtle: "#EFF6FF",
  canvas: "#F5F8FF",
  surface: "#FFFFFF",
  surfaceMuted: "#F1F5F9",
  ink: "#111827",
  inkSecondary: "#6B7280",
  inkMuted: "#64748B",
  line: "#E5E7EB",
  disabled: "#CBD5E1",
  success: "#15803D",
  successSoft: "#DCFCE7",
  warning: "#B45309",
  warningSoft: "#FEF3C7",
  danger: "#DC2626",
  dangerSoft: "#FEE2E2",
  info: "#2563EB",
  infoSoft: "#DBEAFE",
  ai: "#4F46E5",
  aiSoft: "#EEF2FF",
  aiAccent: "#818CF8",
} as const;

/** Chart series, in order. Blue shades first, as the design system asks. */
export const chartSeries = [colors.primary, colors.primaryMedium, colors.primarySoft, colors.primaryDark] as const;

/** Lucide icon sizes and stroke. */
export const iconSize = { sm: 16, md: 20, lg: 24, xl: 28 } as const;
export const iconStroke = 1.75;
