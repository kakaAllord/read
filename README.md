# read

A room to think in. You read a book in the left pane, select a passage, press
`E`, and write about it in the right. Entries stay anchored to the passage that
prompted them.

Single user, no backend. Everything runs in the browser; Google Drive holds the
files.

```
npm install
npm run dev          # http://localhost:5173
npm run build
npm run typecheck
```

## Setting up Drive

The app works without any of this — books and entries live in IndexedDB and
nothing leaves the machine. Drive is what makes the writing outlive the app.

1. In the [Google Cloud console](https://console.cloud.google.com/), create a
   project and enable the **Google Drive API**. Enable the **Google Picker API**
   too if you want the *Add from Drive* path.
2. On the OAuth consent screen, add yourself as a test user. The only scope the
   app asks for is `drive.file`, which is non-sensitive — no verification and no
   CASA assessment. Do **not** add `drive` or `drive.readonly`.
3. Create an **OAuth 2.0 Client ID** of type *Web application*. Under
   *Authorized JavaScript origins* add `http://localhost:5173` and, once
   deployed, your Vercel domain.
4. For the Picker only, create an **API key** and restrict it to the Picker API.
5. Copy `.env.example` to `.env` and fill in:

```
VITE_GOOGLE_CLIENT_ID=…apps.googleusercontent.com
VITE_GOOGLE_API_KEY=…            # optional; only "Add from Drive" needs it
```

Then click **Sign in** in the header. Until you do, the header reads *Local
only*.

### What lands in Drive

```
read/
  library.json          the book catalog
  books/                the uploaded files
  journal/
    2026-09.md          one file per month
```

The journal files are markdown you can read without this app. Each entry keeps
its fields in an HTML comment above the body so it can be read back in; the body
below is exactly as it was written.

## Deploying

Static build. On Vercel the defaults are right (`npm run build` → `dist`);
`vercel.json` rewrites every path to `index.html` so `/book/:id` survives a
refresh. Add the deployed origin to the OAuth client's authorized origins, and
set the two environment variables in the project settings.

## How it fits together

```
src/
  routes/         Dashboard, Library, Reader — the three screens
  components/     the pieces those screens are built from
  lib/
    text/         PDF and EPUB extraction, view-mode detection, covers
    drive/        auth, REST client, Picker, cache, sync
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

**Sync.** IndexedDB is the working copy the interface reads from. Drive is the
durable store, written through on save and debounced. A month is one file, so
saving an entry does not rewrite the journal. Tokens last about an hour with no
refresh token, so every call catches a 401, asks for a new token silently, and
retries once; because a book's bytes are cached in Cache Storage, reading
continues through that and only saving waits.

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
