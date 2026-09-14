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
3. Click the **GitHub mark** in the header, put in `owner/name` and the token,
   and press Connect. Connecting only reads; press **Save** to write.

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
      the-hound-of-the-baskervilles.pdf
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

**A book is pushed when you add it. Notes wait for Save.** The file is the one
thing here that cannot be written again from memory, so it goes up with the
catalog as soon as the Add dialog closes — there is nothing to decide about
whether to keep a book you just chose.

Everything written *about* a book is the opposite. It lands in IndexedDB
immediately and stays there; the header keeps a count of what is waiting —
`Save 3` — and pressing it is what puts it in the repo. No timers, no writes on
a scroll, nothing on the way out of the tab. A note should be a commit you
decided to make, and reading should not produce a hundred of them.

If the push fails — offline, a lapsed token, a file over the ceiling — the book
is still added and still readable, and it joins that same queue instead. The
count in the header is what tells you.

What is waiting is remembered across reloads, so closing the tab with work
pending loses nothing but the pushing of it.

Each file still gets its own commit with its own message, written for you:
`Notes on Mere Christianity (4 entries)`, `Add Mere Christianity to faith`,
`Update the library (7 books)`. `git log` is a record of the reading rather than
a column of "update notes".

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
  routes/         Dashboard, Library, Questions, Reader — the four screens
  components/     the pieces those screens are built from
  lib/
    paint.ts      finding a stored quote in the rendered page and marking it
    text/         PDF extraction, view-mode detection, covers
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
headings.

**Four things, one record.** A note, a bookmark, a highlight and a question
are the same row with a different `kind`. Anchoring, syncing, the markdown in
the repo and the re-finding of a passage years later are identical for all
four, so a second table would have been the same code written twice. Only the
intent differs: a note is something thought, a bookmark is the passage kept
without a word said about it, a highlight is the passage in a colour that
means something, a question is something to go and find out.

**Five colours, and somewhere to say what they mean.** Five is where Apple
Books landed; Kindle's four are the most common complaint made about it. The
colours are theme tokens rather than fixed values, because the yellow that
sits well on white is mud on a dark page.

Every reading app puts a row of swatches at the selection and every one of
them stops there, which leaves what a colour means in your head — and every
guide to colour-coding says the same thing, that a system you do not write
down is one you stop keeping. So the swatches carry names, `⋯` opens the
place to write them, and the journal lists a highlight under what its colour
means rather than under the colour. The legend rides in `library.json`: what a
colour means is a fact about the reader, not about a book, and it has to reach
the other device along with the marks that use it.

**Questions pile up somewhere you will see them.** A question asked mid-book is
worth nothing if the only record of it is inside a book you have closed. The
Questions screen lists the open ones oldest first — the one you have carried
longest is the one to answer — with the passage that prompted it and a link
back to the page. Answered ones are kept, not deleted; a list you can only add
to is a list you stop trusting. The header carries the open count.

**Highlights are painted, not wrapped.** The obvious way to mark a passage is
to wrap the words in `<mark>`, and it is the wrong way here: page mode's text
is a pdf.js text layer that is rebuilt on every render, so anything wrapped
around it is destroyed on the next scroll, and wrapping splits text nodes that
the anchoring code reads back. `lib/paint.ts` uses the CSS Custom Highlight
API instead — `Range` objects registered in `CSS.highlights`, styled by a
`::highlight()` rule, touching no DOM at all.

Because what is stored is the quote and not a coordinate, marking it again is
a search through the rendered text, the way Hypothesis anchors an annotation
and for the same reason. The search folds ligatures and smart quotes the way
the extraction did, and forgives the hyphen a line break left behind — but
only in that exact shape, so `well-known` is never quietly matched by
`wellknown`.

A quote is not unique, though, and that is the part worth getting right: "the
way of a man" occurs on a hundred pages, and painting every occurrence of it
marks the phrase everywhere rather than the sentence you marked. So every
rendered character carries an estimate of its offset into the book, taken from
the nearest element that knows its own, and the occurrence nearest the stored
offset is the only one painted. If the page a passage came from is not on
screen, nothing is painted — a lookalike on another page is worse than no mark
at all.

**Sync.** IndexedDB is the working copy the interface reads from and writes to;
the repo is where that is put when you say so. A book is one file, so saving
rewrites only what changed. Every write quotes the blob sha it read, which is
how GitHub says "the version I read is the version I am replacing" — a stale sha
comes back as a 409, and that is the signal another device wrote first, so the
sha is refetched and the write retried once. A book's bytes are cached in Cache
Storage, so reading carries on through a failed save.

## Keys

| | |
|---|---|
| `E` or `Ctrl+Enter` | write about the selection |
| `H` | highlight it — the palette opens, `1`–`5` pick a colour |
| `B` | bookmark it — press again on it to remove |
| `Q` | ask a question about it |
| `Ctrl+Enter` | save |
| `Esc` | discard |

In the palette, the colour a passage already has picks it off again,
`Backspace` removes it, and `⋯` is where you say what each colour means.

With nothing selected, `E` and `Q` still attach to the page in view, which is
the only thing available on a scan with no text layer to select.

## Notes on the build

- The reader virtualises pages, so a 1,200-page book keeps a handful of cards in
  the DOM. Heights start as an estimate and are replaced as pages render.
- Dictation is press-to-start, press-to-stop. Holding a button down for the
  length of a thought is a thing you notice doing.
- Speech asks for on-device recognition (`processLocally`) so audio does not go
  to a web service, and stores the transcript raw — no auto-punctuation.
- Themes retune the design system's tokens rather than overriding components,
  so the sepia and night palettes reach everything, including the parts of the
  mockup that were transcribed as inline styles.
