# read

A single-user reading and thinking app. No backend: React in the browser,
IndexedDB as the working copy, a private GitHub repo as the durable store.

The research-before-building rule lives in the global CLAUDE.md and applies
here. What it has meant in this project so far: how Adobe and Firefox make a
drawn PDF page selectable, how Hypothesis anchors an annotation to a document
that may be re-parsed, and how a highlight is painted without wrapping the DOM.

## Conventions

- Prose comments explain *why*, in full sentences. Match the surrounding voice:
  plain, unhurried, no marketing.
- Offsets into the book's normalized text are how anything anchors to a
  passage. Never a page coordinate — those do not survive reflow, a font-size
  change or a resize.
- A note, a highlight and a question are one record with a different `kind`.
  Anything that anchors, syncs or renders to markdown treats them alike.
- IndexedDB is written immediately and always. The repo is written on Save,
  except a book's file, which goes up as soon as it is added.
- No EPUB. PDFs only.
