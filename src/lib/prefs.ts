/* Per-device preferences. These describe how this machine shows a book, not
   what the book is, so they stay in localStorage and out of Drive. */

export type Theme = "default" | "sepia" | "dark";

/** 15.5px is what the mockup sets; the rest are the steps up from it. */
export const TEXT_SIZES = [15.5, 17, 18.5, 20] as const;

const KEY = "read.prefs";

export type Prefs = {
  split: number; // left pane, percent
  textSize: number;
  theme: Theme;
};

const DEFAULTS: Prefs = { split: 58, textSize: TEXT_SIZES[0], theme: "default" };

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Prefs>) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function savePrefs(p: Prefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* private window, or storage disabled — the session still works */
  }
}

export function applyPrefs(p: Prefs): void {
  const root = document.documentElement;
  if (p.theme === "default") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", p.theme);
  root.style.setProperty("--reader-text", `${p.textSize}px`);
}
