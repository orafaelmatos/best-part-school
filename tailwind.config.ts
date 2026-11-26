import tailwindAnimate from "tailwindcss-animate";
import type { Config } from "tailwindcss";

// Design system color from src/design-system/tokens.css, with opacity support.
const ds = (token: string) => `rgb(var(--ds-${token}) / <alpha-value>)`;

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ["Plus Jakarta Sans", "system-ui", "sans-serif"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          // Design system shades (docs/design-system/colors.md).
          dark: ds("primary-dark"),
          deep: ds("primary-deep"),
          medium: ds("primary-medium"),
          soft: ds("primary-soft"),
          light: ds("primary-light"),
          subtle: ds("primary-subtle"),
        },
        canvas: ds("canvas"),
        surface: { DEFAULT: ds("surface"), muted: ds("surface-muted") },
        ink: { DEFAULT: ds("ink"), secondary: ds("ink-secondary"), muted: ds("ink-muted") },
        line: ds("line"),
        disabled: ds("disabled"),
        danger: { DEFAULT: ds("danger"), soft: ds("danger-soft") },
        info: { DEFAULT: ds("info"), soft: ds("info-soft") },
        ai: { DEFAULT: ds("ai"), soft: ds("ai-soft"), accent: ds("ai-accent") },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
          soft: ds("success-soft"),
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
          soft: ds("warning-soft"),
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      // Values come from CSS variables: staff keep the previous scale (src/index.css),
      // the student theme uses the design system scale (src/design-system/theme.css).
      borderRadius: {
        xs: "var(--radius-xs)",
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        "2xl": "var(--radius-2xl)",
      },
      fontSize: {
        display: ["2.25rem", { lineHeight: "2.75rem", fontWeight: "700", letterSpacing: "-0.02em" }],
        h1: ["2rem", { lineHeight: "2.5rem", fontWeight: "700", letterSpacing: "-0.02em" }],
        h2: ["1.5rem", { lineHeight: "2rem", fontWeight: "700", letterSpacing: "-0.01em" }],
        h3: ["1.25rem", { lineHeight: "1.75rem", fontWeight: "600" }],
        h4: ["1.125rem", { lineHeight: "1.625rem", fontWeight: "600" }],
        "body-lg": ["1rem", { lineHeight: "1.5rem" }],
        body: ["0.875rem", { lineHeight: "1.375rem" }],
        caption: ["0.75rem", { lineHeight: "1.125rem" }],
        label: ["0.75rem", { lineHeight: "1rem", fontWeight: "600" }],
        button: ["1rem", { lineHeight: "1.5rem", fontWeight: "600" }],
      },
      spacing: {
        gutter: "var(--ds-screen-gutter)",
      },
      boxShadow: {
        raised: "var(--ds-shadow-1)",
        overlay: "var(--ds-shadow-2)",
      },
      transitionTimingFunction: {
        standard: "var(--ds-ease)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.3s ease-out",
      },
    },
  },
  plugins: [tailwindAnimate],
} satisfies Config;
