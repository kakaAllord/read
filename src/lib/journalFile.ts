import type { Entry } from "./types";

/* One file per month, so saving an entry does not rewrite the whole journal.
   The format is markdown a person can read years from now without this app;
   the comment block carries the fields that would otherwise be lost, and the
   body below it is left exactly as written. */

const OPEN = "<!-- read ";
const CLOSE = " -->";
const END = "<!-- /read -->";

type Meta = Omit<Entry, "body"> & { bookTitle?: string };

export function renderMonth(monthKey: string, entries: Entry[], titleOf: (id?: string) => string | undefined): string {
  const sorted = [...entries].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const lines: string[] = [`# ${monthKey}`, ""];

  for (const e of sorted) {
    const meta: Meta = {
      id: e.id,
      bookId: e.bookId,
      title: e.title,
      ref: e.ref,
      anchor: e.anchor,
      excerpt: e.excerpt,
      displayLocation: e.displayLocation,
      wordCount: e.wordCount,
      source: e.source,
      tags: e.tags,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
      bookTitle: titleOf(e.bookId),
    };
    lines.push(`## ${e.title || "Untitled"}`, "");
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

export function parseMonth(markdown: string): Entry[] {
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
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
    });
  }
  return out;
}
