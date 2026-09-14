import type { Entry } from "./types";

/* One file per book, so saving an entry rewrites only what was written about
   that book. The format is markdown a person can read years from now without
   this app; the comment block carries the fields that would otherwise be
   lost, and the body below it is left exactly as written. */

const OPEN = "<!-- read ";
const CLOSE = " -->";
const END = "<!-- /read -->";

type Meta = Omit<Entry, "body" | "kind"> & { kind?: Entry["kind"]; bookTitle?: string };

/* A heading a person can scan down. A question keeps its question mark and
   says whether it is still open; a highlight has nothing written on it, so it
   is named by where it came from. */
function headingFor(e: Entry): string {
  if (e.kind === "bookmark") return e.displayLocation || "Bookmark";
  if (e.kind === "highlight") return e.displayLocation || "Highlight";
  if (e.kind === "question") {
    const asked = e.title || "Untitled";
    return e.status === "answered" ? `${asked} — answered` : asked;
  }
  return e.title || "Untitled";
}

export function renderEntries(
  heading: string,
  entries: Entry[],
  titleOf: (id?: string) => string | undefined,
): string {
  const sorted = [...entries].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const lines: string[] = [`# ${heading}`, ""];

  for (const e of sorted) {
    const meta: Meta = {
      id: e.id,
      kind: e.kind,
      bookId: e.bookId,
      title: e.title,
      ref: e.ref,
      anchor: e.anchor,
      excerpt: e.excerpt,
      displayLocation: e.displayLocation,
      wordCount: e.wordCount,
      source: e.source,
      tags: e.tags,
      color: e.color,
      status: e.status,
      answeredAt: e.answeredAt,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
      bookTitle: titleOf(e.bookId),
    };
    lines.push(`## ${headingFor(e)}`, "");
    lines.push(OPEN + JSON.stringify(meta) + CLOSE, "");
    if (e.excerpt) {
      lines.push(...e.excerpt.split("\n").map((l) => `> ${l}`), "");
    }
    if (e.displayLocation) lines.push(`*${e.displayLocation}*`, "");
    lines.push(e.body.trimEnd(), "");
    lines.push(END, "");
  }
  return lines.join("\n");
}

export function parseEntries(markdown: string): Entry[] {
  const out: Entry[] = [];
  let cursor = 0;
  for (;;) {
    const open = markdown.indexOf(OPEN, cursor);
    if (open < 0) break;
    const closeAt = markdown.indexOf(CLOSE, open);
    if (closeAt < 0) break;
    const json = markdown.slice(open + OPEN.length, closeAt);
    const endAt = markdown.indexOf(END, closeAt);
    const tail = markdown.slice(closeAt + CLOSE.length, endAt < 0 ? undefined : endAt);
    cursor = endAt < 0 ? markdown.length : endAt + END.length;

    let meta: Meta;
    try {
      meta = JSON.parse(json) as Meta;
    } catch {
      continue;
    }

    /* Strip the quoted excerpt and the location line back off; what is left
       is the body as it was typed. */
    let body = tail;
    if (meta.excerpt) {
      const quoted = meta.excerpt
        .split("\n")
        .map((l) => `> ${l}`)
        .join("\n");
      body = body.replace(quoted, "");
    }
    if (meta.displayLocation) body = body.replace(`*${meta.displayLocation}*`, "");

    out.push({
      id: meta.id,
      /* Written before there was anything else to write. */
      kind: meta.kind ?? "note",
      bookId: meta.bookId,
      title: meta.title,
      ref: meta.ref,
      body: body.trim(),
      anchor: meta.anchor,
      excerpt: meta.excerpt,
      displayLocation: meta.displayLocation,
      wordCount: meta.wordCount,
      source: meta.source,
      tags: meta.tags ?? [],
      color: meta.color,
      status: meta.status,
      answeredAt: meta.answeredAt,
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
    });
  }
  return out;
}
