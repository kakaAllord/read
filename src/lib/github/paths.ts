/* What the repo looks like from the outside is the point of putting it in a
   repo at all, so the paths are the ones a person would have chosen:

     books/faith/mere-christianity/
       mere-christianity.pdf
       notes.md

   A book is a folder, and what was written about it sits next to it. Opening
   that folder on github.com is the whole of a reading: the text and the
   thinking, in one place, without this app. */

export function slug(s: string): string {
  const base = s
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[‘’']/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return base || "untitled";
}

export const LIBRARY = "library.json";
export const JOURNAL = "journal";
export const BOOKS = "books";
export const NOTES = "notes.md";

export function genreDir(genre: string): string {
  return `${BOOKS}/${slug(genre)}`;
}

/** The folder a book and its notes share. */
export function bookDir(genre: string, title: string, n = 0): string {
  const suffix = n > 0 ? `-${n + 1}` : "";
  return `${genreDir(genre)}/${slug(title)}${suffix}`;
}

export function bookPath(genre: string, title: string, format: string, n = 0): string {
  const dir = bookDir(genre, title, n);
  return `${dir}/${dir.split("/").pop()}.${format}`;
}

export function notesPath(dir: string): string {
  return `${dir}/${NOTES}`;
}

/** Entries not tied to a book — the type allows them — still go by month. */
export function monthPath(monthKey: string): string {
  return `${JOURNAL}/${monthKey}.md`;
}

/* A book's stored key is the repo path with a scheme on it, so a key from
   the old Drive build (a bare file id) is still recognisably not one. */
export const GH = "gh:";

export function keyFor(path: string): string {
  return GH + path;
}

export function pathOf(key: string): string | null {
  return key.startsWith(GH) ? key.slice(GH.length) : null;
}

/** Where a book's notes live, worked out from where its file lives, so the
    two cannot drift apart. Null for a book that was never pushed. */
export function notesPathForKey(key: string): string | null {
  const path = pathOf(key);
  if (!path) return null;
  const dir = path.slice(0, path.lastIndexOf("/"));
  return dir ? notesPath(dir) : null;
}
