/* What the repo looks like from the outside is the point of putting it in a
   repo at all, so the paths are the ones a person would have chosen:
   books/faith/mere-christianity.pdf, not books/b8f2a1c9.pdf. */

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

export function genreDir(genre: string): string {
  return `${BOOKS}/${slug(genre)}`;
}

export function bookPath(genre: string, title: string, format: string, n = 0): string {
  const suffix = n > 0 ? `-${n + 1}` : "";
  return `${genreDir(genre)}/${slug(title)}${suffix}.${format}`;
}

export function monthPath(monthKey: string): string {
  return `${JOURNAL}/${monthKey}.md`;
}

/** A book's stored key is the repo path with a scheme on it, so a key from
    the old Drive build (a bare file id) is still recognisably not one. */
export const GH = "gh:";

export function keyFor(path: string): string {
  return GH + path;
}

export function pathOf(key: string): string | null {
  return key.startsWith(GH) ? key.slice(GH.length) : null;
}
