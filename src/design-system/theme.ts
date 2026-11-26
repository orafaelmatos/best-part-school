import { useEffect } from "react";

export const STUDENT_THEME = "student";

/** Applies the student theme to <html>, so portals (dialogs, sheets, toasts) inherit it. */
export function applyStudentTheme(root: HTMLElement = document.documentElement) {
  root.dataset.theme = STUDENT_THEME;
}

export function removeStudentTheme(root: HTMLElement = document.documentElement) {
  if (root.dataset.theme === STUDENT_THEME) delete root.dataset.theme;
}

/** Keeps the student theme active while a student screen is mounted (legacy web build). */
export function useStudentTheme() {
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.dataset.theme;
    applyStudentTheme(root);
    return () => {
      if (previous === undefined) removeStudentTheme(root);
      else root.dataset.theme = previous;
    };
  }, []);
}
