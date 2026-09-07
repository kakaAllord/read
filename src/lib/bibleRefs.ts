/* Headings drift — "Romans 8", "Rom 8", "romans 8 again". On save the heading
   is matched against the 66 books plus the abbreviations people actually type,
   and a normalized form is stored alongside it. No match means no ref, which
   is the right answer for a leadership book. */

type BookEntry = { abbr: string; names: string[] };

const BOOKS: BookEntry[] = [
  { abbr: "Gen", names: ["genesis", "gen", "ge", "gn"] },
  { abbr: "Exod", names: ["exodus", "exod", "exo", "ex"] },
  { abbr: "Lev", names: ["leviticus", "lev", "le", "lv"] },
  { abbr: "Num", names: ["numbers", "num", "nu", "nm", "nb"] },
  { abbr: "Deut", names: ["deuteronomy", "deut", "deu", "dt"] },
  { abbr: "Josh", names: ["joshua", "josh", "jos", "jsh"] },
  { abbr: "Judg", names: ["judges", "judg", "jdg", "jg", "jdgs"] },
  { abbr: "Ruth", names: ["ruth", "rth", "ru"] },
  { abbr: "1Sam", names: ["1 samuel", "1samuel", "1 sam", "1sam", "1 sa", "1sa"] },
  { abbr: "2Sam", names: ["2 samuel", "2samuel", "2 sam", "2sam", "2 sa", "2sa"] },
  { abbr: "1Kgs", names: ["1 kings", "1kings", "1 kgs", "1kgs", "1 ki", "1ki"] },
  { abbr: "2Kgs", names: ["2 kings", "2kings", "2 kgs", "2kgs", "2 ki", "2ki"] },
  { abbr: "1Chr", names: ["1 chronicles", "1chronicles", "1 chron", "1 chr", "1chr"] },
  { abbr: "2Chr", names: ["2 chronicles", "2chronicles", "2 chron", "2 chr", "2chr"] },
  { abbr: "Ezra", names: ["ezra", "ezr", "ez"] },
  { abbr: "Neh", names: ["nehemiah", "neh", "ne"] },
  { abbr: "Esth", names: ["esther", "esth", "est", "es"] },
  { abbr: "Job", names: ["job", "jb"] },
  { abbr: "Ps", names: ["psalms", "psalm", "psa", "ps", "pslm", "psm"] },
  { abbr: "Prov", names: ["proverbs", "prov", "pro", "prv", "pr"] },
  { abbr: "Eccl", names: ["ecclesiastes", "eccles", "eccle", "eccl", "ecc", "ec", "qoheleth"] },
  { abbr: "Song", names: ["song of solomon", "song of songs", "song", "sos", "canticles", "cant"] },
  { abbr: "Isa", names: ["isaiah", "isa", "is"] },
  { abbr: "Jer", names: ["jeremiah", "jer", "je", "jr"] },
  { abbr: "Lam", names: ["lamentations", "lam", "la"] },
  { abbr: "Ezek", names: ["ezekiel", "ezek", "eze", "ezk"] },
  { abbr: "Dan", names: ["daniel", "dan", "da", "dn"] },
  { abbr: "Hos", names: ["hosea", "hos", "ho"] },
  { abbr: "Joel", names: ["joel", "jol", "joe", "jl"] },
  { abbr: "Amos", names: ["amos", "amo", "am"] },
  { abbr: "Obad", names: ["obadiah", "obad", "oba", "ob"] },
  { abbr: "Jonah", names: ["jonah", "jon", "jnh"] },
  { abbr: "Mic", names: ["micah", "mic", "mc"] },
  { abbr: "Nah", names: ["nahum", "nah", "na"] },
  { abbr: "Hab", names: ["habakkuk", "hab", "hb"] },
  { abbr: "Zeph", names: ["zephaniah", "zeph", "zep", "zp"] },
  { abbr: "Hag", names: ["haggai", "hag", "hg"] },
  { abbr: "Zech", names: ["zechariah", "zech", "zec", "zc"] },
  { abbr: "Mal", names: ["malachi", "mal", "ml"] },
  { abbr: "Matt", names: ["matthew", "matt", "mat", "mt"] },
  { abbr: "Mark", names: ["mark", "mrk", "mar", "mk", "mr"] },
  { abbr: "Luke", names: ["luke", "luk", "lk"] },
  { abbr: "John", names: ["john", "joh", "jhn", "jn"] },
  { abbr: "Acts", names: ["acts", "act", "ac"] },
  { abbr: "Rom", names: ["romans", "rom", "ro", "rm"] },
  { abbr: "1Cor", names: ["1 corinthians", "1corinthians", "1 cor", "1cor", "1 co", "1co"] },
  { abbr: "2Cor", names: ["2 corinthians", "2corinthians", "2 cor", "2cor", "2 co", "2co"] },
  { abbr: "Gal", names: ["galatians", "gal", "ga"] },
  { abbr: "Eph", names: ["ephesians", "eph", "ephes"] },
  { abbr: "Phil", names: ["philippians", "phil", "php", "pp"] },
  { abbr: "Col", names: ["colossians", "col", "co"] },
  { abbr: "1Thess", names: ["1 thessalonians", "1thessalonians", "1 thess", "1thess", "1 th", "1th"] },
  { abbr: "2Thess", names: ["2 thessalonians", "2thessalonians", "2 thess", "2thess", "2 th", "2th"] },
  { abbr: "1Tim", names: ["1 timothy", "1timothy", "1 tim", "1tim", "1 ti", "1ti"] },
  { abbr: "2Tim", names: ["2 timothy", "2timothy", "2 tim", "2tim", "2 ti", "2ti"] },
  { abbr: "Titus", names: ["titus", "tit", "ti"] },
  { abbr: "Phlm", names: ["philemon", "philem", "phlm", "pm"] },
  { abbr: "Heb", names: ["hebrews", "heb"] },
  { abbr: "Jas", names: ["james", "jas", "jm"] },
  { abbr: "1Pet", names: ["1 peter", "1peter", "1 pet", "1pet", "1 pe", "1pe"] },
  { abbr: "2Pet", names: ["2 peter", "2peter", "2 pet", "2pet", "2 pe", "2pe"] },
  { abbr: "1John", names: ["1 john", "1john", "1 jn", "1jn", "1 jo", "1jo"] },
  { abbr: "2John", names: ["2 john", "2john", "2 jn", "2jn", "2 jo", "2jo"] },
  { abbr: "3John", names: ["3 john", "3john", "3 jn", "3jn", "3 jo", "3jo"] },
  { abbr: "Jude", names: ["jude", "jud", "jd"] },
  { abbr: "Rev", names: ["revelation", "revelations", "rev", "re", "apocalypse"] },
];

const LOOKUP = new Map<string, string>();
for (const b of BOOKS) for (const n of b.names) LOOKUP.set(n, b.abbr);

/* Longest name first, so "1 john" wins over "john" and "song of songs" over
   "song". Ordinals are folded to digits before matching. */
const NAMES = [...LOOKUP.keys()].sort((a, b) => b.length - a.length);

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/\b(first|1st|i)\s+(?=[a-z])/g, "1 ")
    .replace(/\b(second|2nd|ii)\s+(?=[a-z])/g, "2 ")
    .replace(/\b(third|3rd|iii)\s+(?=[a-z])/g, "3 ")
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * "Romans 8 — on suffering" -> "Rom.8"
 * "Psalm 22:24"             -> "Ps.22.24"
 * "What I owe my team"      -> undefined
 */
export function parseRef(heading: string | undefined): string | undefined {
  if (!heading) return undefined;
  const h = normalize(heading);
  for (const name of NAMES) {
    const at = h.indexOf(name);
    if (at < 0) continue;
    const before = at === 0 ? "" : h[at - 1];
    if (before && /[a-z0-9]/.test(before)) continue;
    const rest = h.slice(at + name.length);
    if (rest && /^[a-z]/.test(rest)) continue;
    const abbr = LOOKUP.get(name)!;
    const m = /^\s*(\d{1,3})(?:\s*[:\s]\s*(\d{1,3}))?/.exec(rest);
    if (!m) return abbr;
    return m[2] ? `${abbr}.${m[1]}.${m[2]}` : `${abbr}.${m[1]}`;
  }
  return undefined;
}
