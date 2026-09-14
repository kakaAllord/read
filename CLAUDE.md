# read

A single-user reading and thinking app. No backend: React in the browser,
IndexedDB as the working copy, a private GitHub repo as the durable store.

## Research before building

**Before implementing any feature, research how existing tools solve it, and
say what you found before writing code.** Not to copy them — to know what the
established approach is, which parts of it are essential, and where the
received wisdom is worth departing from. A feature built without that is a
guess.

This applies to features and to the techniques underneath them: how Adobe and
Firefox make a drawn PDF page selectable, how annotation tools survive a
document being re-parsed, how reading apps model a highlight. Check the
platform first — a browser API or a shipped library method usually beats a
hand-rolled version, and knowing it exists is the difference.

Prefer primary sources: the spec, the library's own source or shipped CSS, the
implementation. Blog posts go stale and often describe an older version's API —
verify against what is actually installed in `node_modules` before relying on
it. Say which sources you used.

## Conventions

- Prose comments explain *why*, in full sentences. Match the surrounding voice:
  plain, unhurried, no marketing.
- Offsets into the book's normalized text are how anything anchors to a
  passage. Never a page coordinate — those do not survive reflow, a font-size
  change or a resize.
- IndexedDB is written immediately and always. The repo is written on Save,
  except a book's file, which goes up as soon as it is added.
- No EPUB. PDFs only.
