/* Ligatures and smart quotes, folded once so that everything downstream —
   search, anchors, word counts — sees the same characters the reader does. */
const LIGATURES: [RegExp, string][] = [
  [/ﬀ/g, "ff"],
  [/ﬁ/g, "fi"],
  [/ﬂ/g, "fl"],
  [/ﬃ/g, "ffi"],
  [/ﬄ/g, "ffl"],
  [/ﬅ/g, "st"],
  [/ﬆ/g, "st"],
];

export function normalizeText(s: string): string {
  let out = s;
  for (const [re, to] of LIGATURES) out = out.replace(re, to);
  return out
    .replace(/­/g, "") // soft hyphen
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”‟]/g, '"')
    .replace(/[‐‑]/g, "-")
    .replace(/−/g, "-")
    .replace(/ /g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
