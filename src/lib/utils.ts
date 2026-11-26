import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Teach tailwind-merge the design system scales (tailwind.config.ts). Without this,
// `text-h4 text-ink` is read as two text colors and the font size is dropped.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["display", "h1", "h2", "h3", "h4", "body-lg", "body", "caption", "label", "button"] }],
      shadow: [{ shadow: ["raised", "overlay"] }],
      ease: [{ ease: ["standard"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
