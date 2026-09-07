/* Entries are stored in UTC and bucketed by *local* date, with the day
   starting at 4am. A note written at 12:30am belongs to the day it feels
   like, not the one the clock has just started. */
export const DAY_START_HOUR = 4;

export function localDayKey(iso: string): string {
  const d = new Date(iso);
  const shifted = new Date(d.getTime() - DAY_START_HOUR * 3600_000);
  const y = shifted.getFullYear();
  const m = String(shifted.getMonth() + 1).padStart(2, "0");
  const day = String(shifted.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayKey(now = new Date()): string {
  return localDayKey(now.toISOString());
}

/** The key `n` days before `from` (a key produced by localDayKey). */
export function keyMinus(from: string, n: number): string {
  const [y, m, d] = from.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(
    dt.getDate(),
  ).padStart(2, "0")}`;
}

/** Consecutive days ending today (or yesterday, if today has nothing yet). */
export function streakFrom(dayKeys: Set<string>, now = new Date()): number {
  const today = todayKey(now);
  let cursor = dayKeys.has(today) ? today : keyMinus(today, 1);
  if (!dayKeys.has(cursor)) return 0;
  let n = 0;
  while (dayKeys.has(cursor)) {
    n++;
    cursor = keyMinus(cursor, 1);
  }
  return n;
}

export function longestStreak(dayKeys: Set<string>): number {
  const sorted = [...dayKeys].sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const k of sorted) {
    run = prev && keyMinus(k, 1) === prev ? run + 1 : 1;
    if (run > best) best = run;
    prev = k;
  }
  return best;
}

const WORDED = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight",
  "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
  "sixteen", "seventeen", "eighteen", "nineteen",
];
const TENS = [
  "", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty",
  "ninety",
];

/** The dashboard says "Longest so far, thirty-one." — spelled, not numeric. */
export function spellNumber(n: number): string {
  if (n < 20) return WORDED[n] ?? String(n);
  if (n < 100) {
    const t = TENS[Math.floor(n / 10)];
    const r = n % 10;
    return r ? `${t}-${WORDED[r]}` : t;
  }
  return String(n);
}

/** "7 Sep" — the format the artboard's entry rows use. */
export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

export function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** "9 June" / "7 September" — the graph's end labels. */
export function longDate(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
  });
}
