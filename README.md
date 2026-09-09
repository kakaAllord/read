# read

A room to think in. You read a book in the left pane, select a passage, press
`E`, and write about it in the right. Entries stay anchored to the passage that
prompted them.

Single user, no backend. Everything runs in the browser; a private GitHub repo
holds the files.

```
npm install
npm run dev          # http://localhost:4001
npm run build
npm run typecheck
```

## Connecting a repository

The app works without one — books and entries live in IndexedDB and nothing
leaves the machine. The repo is what makes the writing outlive the app, and what
puts the same journal in front of you on a different device.

1. Make a repository — private, and separate from this one; the library is
   not source code. Tick **Add a README** so the default branch exists before
   the app writes to it.
2. Make a [fine-grained token](https://github.com/settings/personal-access-tokens/new).
   Under *Repository access* choose **Only select repositories** and pick that
   one. Under *Repository permissions* set **Contents: Read and write**. Nothing
   else — no other permission is used.
3. Click **Local only** in the header, put in `owner/name` and the token, and
   press Connect.

There is no build-time configuration and no OAuth app: the token is checked
against the repo before it is stored, then kept in this browser's
`localStorage`. That is also the thing to be careful about — anyone with the
browser profile has the token, so give it an expiry date and keep the repo
private. Connecting the same repo somewhere else pulls the journal down; the
newer copy of an entry wins, so a note written offline is never overwritten by a
stale one.

### What lands in the repo

```
library.json                      the book catalog
books/
  faith/
    mere-christianity/
      mere-christianity.pdf
      notes.md                    everything written about it
  detective/
    the-hound-of-the-baskervilles/
      the-hound-of-the-baskervilles.epub
      notes.md
journal/
  2026-09.md                      entries not tied to a book
```

A book is a folder, and what was written about it sits next to it. Opening that
folder on github.com is the whole of a reading — the text and the thinking, in
one place, without this app.

The genre typed into the Add dialog is the folder the book goes in, lowercased
and hyphenated. It is settled at import: renaming a genre later moves the book
on the shelf but leaves the files where they were put.

`notes.md` is markdown you can read without this app. Each entry keeps its
fields in an HTML comment above the body so it can be read back in; the body
below is exactly as it was written.

**A save is a commit.** Pressing `Ctrl+Enter` in the composer writes that book's
`notes.md` and commits it there and then — no timer, nothing batched. The
message is written for you from what you just wrote: `Note on Mere Christianity:
On patience`, or the page if the entry has no title. `git log` is therefore a
record of the reading, in order, not a column of "update notes".

**What it will not take.** GitHub warns over 50MB a file and blocks at 100MB,
and the Contents API carries a file as base64 in one JSON body, so the ceiling
here is about 45MB. A big scan has to be compressed before it will go up. Git
also keeps every version forever: books are written once so that costs nothing,
but it is worth knowing that deleting a book from the repo does not shrink it.

## Deploying

Static build. On Vercel the defaults are right (`npm run build` → `dist`);
`vercel.json` rewrites every path to `index.html` so `/book/:id` survives a
refresh. There is nothing to configure — no environment variables, no origins to
register. Open the deployed app, connect the same repo, and the library is
there.

## How it fits together

```
src/
  routes/         Dashboard, Library, Reader — the three screens
  components/     the pieces those screens are built from
  lib/
    text/         PDF and EPUB extraction, view-mode detection, covers
    github/       config, the Contents API client, repo paths
    sync.ts       what gets written up, when, and what comes back down
    journalFile.ts  the markdown entries are rendered to and parsed from
    cache.ts      book bytes, kept in Cache Storage
    anchors.ts    turning a selection into an anchor, and finding it again
    db.ts         Dexie schema
```

**Offsets, not page numbers.** An entry's anchor holds a character index into
the book's normalized text plus the quote and thirty characters either side of
it. That survives reflow, a font-size change and a window resize; a page
coordinate does not. Page numbers are computed for display only, and an entry's
`displayLocation` is frozen at save time so an old entry keeps saying what it
said.

**Two view modes, decided at import.** After upload the app samples the file for
characters per page, how many pages carry any text, and whether line starts
cluster into more than one column. A scan or a two-column journal article goes
to page mode — the file drawn to canvas — because reflowing either produces
nonsense. Everything else is re-typeset in the app's own typography. The dialog
says which mode a book landed in and lets you override it.

**Paragraph reconstruction.** `getTextContent()` returns positioned glyph runs
with no structure. `lib/text/pdfExtract.ts` groups them into lines, takes the
book's median line gap, left edge and glyph height, and starts a paragraph on a
gap over 1.4× the median, an indent, or a short previous line. It de-hyphenates
line breaks, strips running heads and folios, and treats oversized lines as
headings. EPUB skips all of this — it is already semantic HTML.

**Sync.** IndexedDB is the working copy the interface reads from. The repo is
the durable store. An entry is committed the moment it is saved; the catalog,
which changes every time a page scrolls past, is debounced instead. A book is
one file, so saving an entry rewrites only what was written about that book,
and two saves a second apart queue behind each other rather than racing for the
same blob. Every write quotes the blob sha it read, which is how GitHub says
"the version I read is the version I am replacing" — a stale sha comes back as
a 409, and that is the signal another device wrote first, so the sha is
refetched and the write retried once. A book's bytes are cached in Cache
Storage, so reading carries on through a failed save.

## Keys

| | |
|---|---|
| `E` or `Ctrl+Enter` | open the composer on the selection |
| `Ctrl+Enter` | save the entry |
| `Esc` | discard it |

## Notes on the build

- The reader virtualises pages, so a 1,200-page book keeps a handful of cards in
  the DOM. Heights start as an estimate and are replaced as pages render.
- Speech asks for on-device recognition (`processLocally`) so audio does not go
  to a web service, and stores the transcript raw — no auto-punctuation.
- Themes retune the design system's tokens rather than overriding components,
  so the sepia and night palettes reach everything, including the parts of the
  mockup that were transcribed as inline styles.
