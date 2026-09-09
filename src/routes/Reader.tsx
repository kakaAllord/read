import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

import { db } from "../lib/db";
import { anchorFromSelection, pageAt, resolveAnchor } from "../lib/anchors";
import { labelFor, loadBookBytes, loadBookText, rememberLocation, saveEntry } from "../lib/store";
import { openPdf, type PDFDocumentProxy } from "../lib/text/pdf";
import { clock, useFocus, BREAK_SECONDS, WORK_SECONDS } from "../hooks/useFocus";
import { usePrefs } from "../hooks/usePrefs";
import type { Anchor, BookText, Entry } from "../lib/types";

import BookPageCard, { type Mark } from "../components/BookPane";
import PdfPageCard from "../components/PdfPageCard";
import VirtualPages from "../components/VirtualPages";
import Composer, { type ComposerDraft } from "../components/Composer";
import JournalPane from "../components/JournalPane";
import ReadingControls from "../components/ReadingControls";

const muted = (pct: number) => `color-mix(in srgb, var(--color-text) ${pct}%, transparent)`;
const RING = 50.27; // 2πr for the 8-radius circle the chip draws

export default function Reader() {
  const { bookId = "" } = useParams();
  const navigate = useNavigate();
  const [prefs, setPrefs] = usePrefs();

  const book = useLiveQuery(() => db.books.get(bookId), [bookId], undefined);
  const entries = useLiveQuery(
    () => db.entries.where("bookId").equals(bookId).toArray(),
    [bookId],
    undefined,
  );

  const [text, setText] = useState<BookText | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [pageIndex, setPageIndex] = useState(0);
  const [pageField, setPageField] = useState("");
  const [jump, setJump] = useState<{ index: number; token: number } | null>(null);
  const [draft, setDraft] = useState<ComposerDraft | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const jumpToken = useRef(0);
  const restored = useRef(false);

  const focus = useFocus(bookId);

  /* — the book —
     Reading position is written back to the book row as the pane scrolls, so
     the live query hands back a fresh object several times a minute. These
     effects therefore hang off the identity of the *file*, not the record;
     depending on `book` would re-extract the whole text on every scroll. */
  const identity = book ? `${book.id}|${book.format}|${book.fileKey}` : "";
  const viewMode = book?.viewMode;
  const bookRef = useRef(book);
  bookRef.current = book;

  useEffect(() => {
    const current = bookRef.current;
    if (!current) return;
    let live = true;
    setText(null);
    setPdf(null);
    setLoadError(null);
    restored.current = false;
    loadBookText(current)
      .then((t) => live && setText(t))
      .catch(
        (err: unknown) => live && setLoadError(err instanceof Error ? err.message : String(err)),
      );
    return () => {
      live = false;
    };
  }, [identity]);

  useEffect(() => {
    const current = bookRef.current;
    if (!current || viewMode !== "page" || current.format !== "pdf") return;
    let live = true;
    loadBookBytes(current)
      .then(openPdf)
      .then((doc) => live && setPdf(doc))
      .catch(
        (err: unknown) => live && setLoadError(err instanceof Error ? err.message : String(err)),
      );
    return () => {
      live = false;
    };
  }, [identity, viewMode]);

  /* Resume where the book was left, once, after the text is in. */
  useEffect(() => {
    const current = bookRef.current;
    if (!current || !text || restored.current) return;
    restored.current = true;
    const index = current.lastLocation > 0 ? pageAt(text, current.lastLocation) : 0;
    setPageIndex(index);
    setPageField(String(text.pages[index]?.number ?? index + 1));
    if (index > 0) setJump({ index, token: ++jumpToken.current });
  }, [text]);

  /* — anchors already written against this book — */
  const marks: Mark[] = useMemo(() => {
    if (!text || !entries) return [];
    const out: Mark[] = [];
    for (const e of entries) {
      if (e.anchor.kind !== "quote") continue;
      const at = resolveAnchor(e.anchor, text);
      if (at === null) continue;
      out.push({ start: at, end: at + e.anchor.exact.length });
    }
    return out;
  }, [text, entries]);

  const chapterPages = useMemo(() => {
    if (!text) return new Map<string, number>();
    const map = new Map<string, number>();
    for (const page of text.pages) {
      for (const b of page.blocks) {
        if (b.kind === "heading" && text.chapters.includes(b.text) && !map.has(b.text)) {
          map.set(b.text, page.index);
        }
      }
      if (page.running && text.chapters.includes(page.running) && !map.has(page.running)) {
        map.set(page.running, page.index);
      }
    }
    return map;
  }, [text]);

  const chapters = useMemo(
    () => (text ? text.chapters.filter((c) => chapterPages.has(c)) : []),
    [text, chapterPages],
  );

  /* The chapter the current page falls in — the last one that starts at or
     before it, which is what the select should be showing. */
  const currentChapter = useMemo(() => {
    let found = "";
    let bestStart = -1;
    for (const c of chapters) {
      const start = chapterPages.get(c) ?? -1;
      if (start <= pageIndex && start > bestStart) {
        bestStart = start;
        found = c;
      }
    }
    return found;
  }, [chapters, chapterPages, pageIndex]);

  /* Scrolling walks through pages quickly; the position only needs to be
     durable once the reader has settled on one. */
  const locationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (locationTimer.current) clearTimeout(locationTimer.current);
    },
    [],
  );

  const onVisible = useCallback(
    (index: number) => {
      setPageIndex(index);
      if (!text) return;
      const page = text.pages[index];
      if (!page) return;
      setPageField(String(page.number));
      if (locationTimer.current) clearTimeout(locationTimer.current);
      locationTimer.current = setTimeout(() => {
        void rememberLocation(bookId, page.offset, {
          page: typeof page.number === "number" ? page.number : index + 1,
          pageCount: book?.pageCount ?? text.pages.length,
        });
      }, 800);
    },
    [text, bookId, book?.pageCount],
  );

  const goToPage = useCallback(
    (index: number) => {
      if (!text) return;
      const clamped = Math.max(0, Math.min(text.pages.length - 1, index));
      setJump({ index: clamped, token: ++jumpToken.current });
    },
    [text],
  );

  /* — the core interaction: select, one key, write — */
  const openComposer = useCallback(() => {
    if (!text) return;
    const found = anchorFromSelection(bookId, text);
    if (found) {
      const offset = found.anchor.kind === "free" ? 0 : found.anchor.offset;
      setDraft({
        anchor: found.anchor,
        excerpt: found.exact,
        displayLocation: labelFor(text, offset),
      });
    } else {
      setDraft({ anchor: { kind: "free" } as Anchor });
    }
    window.getSelection()?.removeAllRanges();
  }, [bookId, text]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (draft) return; // the composer owns the keyboard while it is open
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase() ?? "";
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "Enter") {
          e.preventDefault();
          openComposer();
        }
        return;
      }
      if (e.altKey) return;
      if (e.key === "e" || e.key === "E") {
        e.preventDefault();
        openComposer();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [draft, openComposer]);

  async function save(v: { title: string; body: string; source: Entry["source"] }) {
    if (!draft) return;
    if (!v.title.trim() && !v.body.trim()) {
      setDraft(null);
      return;
    }
    await saveEntry({
      bookId,
      title: v.title,
      body: v.body,
      anchor: draft.anchor,
      excerpt: draft.excerpt,
      displayLocation: draft.displayLocation,
      source: v.source,
    });
    setDraft(null);
  }

  function jumpToEntry(entry: Entry) {
    if (!text) return;
    const at = resolveAnchor(entry.anchor, text);
    if (at === null) return;
    goToPage(pageAt(text, at));
  }

  if (!book) {
    return (
      <main style={{ flex: 1, display: "grid", placeItems: "center", color: muted(50) }}>
        <div style={{ fontStyle: "italic", fontSize: 14 }}>That book is not on the shelf.</div>
      </main>
    );
  }

  const pageCount = book.pageCount ?? text?.pages.length ?? 0;
  const sorted = [...(entries ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const focusTotal = focus.mode === "break" ? BREAK_SECONDS : WORK_SECONDS;
  const focusDone = focus.mode === "idle" ? 0 : 1 - focus.left / focusTotal;
  const focusLabel =
    focus.mode === "idle"
      ? "Focus session"
      : focus.running
        ? `${focus.mode === "break" ? "Break " : ""}${clock(focus.left)}`
        : `Paused ${clock(focus.left)}`;

  const dimJournal = focus.mode === "work" && focus.running && !draft;

  return (
    <main style={{ flex: 1, display: "flex", minHeight: 0 }}>
      <PanelGroup
        direction="horizontal"
        autoSaveId="read.split"
        onLayout={(sizes) => setPrefs({ split: sizes[0] })}
        style={{ flex: 1, minHeight: 0 }}
      >
        <Panel defaultSize={prefs.split} minSize={32} maxSize={76}>
          <section
            style={{
              display: "flex",
              flexDirection: "column",
              minWidth: 0,
              minHeight: 0,
              height: "100%",
            }}
          >
            <div
              style={{
                flex: "none",
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: "8px 14px",
                padding: "10px 24px",
                borderBottom: "1px solid var(--color-divider)",
              }}
            >
              <div
                onClick={() => navigate("/library")}
                style={{
                  flex: "none",
                  fontSize: 12,
                  whiteSpace: "nowrap",
                  color: "var(--color-accent-700)",
                  cursor: "pointer",
                }}
              >
                ← Library
              </div>
              <div
                style={{
                  fontFamily: "var(--font-heading)",
                  fontSize: 15,
                  flex: "1 1 auto",
                  minWidth: 130,
                  marginRight: "auto",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {book.title}
              </div>

              {chapters.length > 0 && (
                <select
                  className="input"
                  value={currentChapter}
                  onChange={(e) => {
                    const index = chapterPages.get(e.target.value);
                    if (index !== undefined) goToPage(index);
                  }}
                  style={{ width: "auto", minHeight: 30, fontSize: 12, padding: "3px 8px" }}
                >
                  {currentChapter === "" && <option value="">—</option>}
                  {chapters.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              )}

              <div
                onClick={focus.toggle}
                className="chip"
                style={{
                  display: "inline-flex",
                  flex: "none",
                  alignItems: "center",
                  gap: 7,
                  padding: "4px 11px 4px 6px",
                  border: `1px solid ${
                    focus.mode === "idle" ? "var(--color-divider)" : "var(--color-accent)"
                  }`,
                  borderRadius: "var(--radius-md)",
                  cursor: "pointer",
                  userSelect: "none",
                  background:
                    focus.mode === "idle"
                      ? "transparent"
                      : "color-mix(in srgb, var(--color-accent) 9%, transparent)",
                }}
              >
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 20 20"
                  style={{ display: "block", transform: "rotate(-90deg)" }}
                >
                  <circle
                    cx="10"
                    cy="10"
                    r="8"
                    fill="none"
                    stroke="var(--color-neutral-300)"
                    strokeWidth="1.6"
                  />
                  <circle
                    cx="10"
                    cy="10"
                    r="8"
                    fill="none"
                    stroke={
                      focus.mode === "break"
                        ? "var(--color-accent-400)"
                        : "var(--color-accent)"
                    }
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeDasharray={RING}
                    strokeDashoffset={RING * (1 - focusDone)}
                  />
                </svg>
                <div
                  style={{
                    fontSize: 11.5,
                    fontVariantNumeric: "tabular-nums",
                    whiteSpace: "nowrap",
                    color: focus.mode === "idle" ? muted(55) : "var(--color-accent-800)",
                  }}
                >
                  {focusLabel}
                </div>
              </div>

              {focus.mode !== "idle" && (
                <div
                  onClick={focus.reset}
                  style={{ flex: "none", fontSize: 11, cursor: "pointer", color: muted(45) }}
                >
                  end
                </div>
              )}

              <ReadingControls />

              <div
                style={{
                  display: "flex",
                  flex: "none",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 11,
                  color: muted(50),
                }}
              >
                <input
                  className="input"
                  value={pageField}
                  onChange={(e) => setPageField(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" || !text) return;
                    const wanted = parseInt(pageField, 10);
                    if (!Number.isFinite(wanted)) return;
                    const found = text.pages.findIndex((p) => Number(p.number) === wanted);
                    goToPage(found >= 0 ? found : wanted - 1);
                  }}
                  title="Jump to page"
                  style={{
                    width: 56,
                    minHeight: 30,
                    fontSize: 12,
                    padding: "3px 8px",
                    textAlign: "center",
                    fontVariantNumeric: "tabular-nums",
                  }}
                />
                <div style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                  of {pageCount}
                </div>
              </div>
            </div>

            <div
              ref={scrollRef}
              style={{
                flex: 1,
                overflow: "auto",
                padding: "40px 0 120px",
                background: "var(--color-reader-ground)",
              }}
            >
              {loadError && (
                <div
                  style={{
                    width: "min(640px, calc(100% - 48px))",
                    margin: "0 auto",
                    fontSize: 14,
                    lineHeight: 1.7,
                    fontStyle: "italic",
                    color: muted(60),
                  }}
                >
                  {loadError}
                </div>
              )}
              {!text && !loadError && (
                <div
                  className="spin"
                  style={{
                    width: "min(640px, calc(100% - 48px))",
                    margin: "0 auto",
                    fontSize: 14,
                    fontStyle: "italic",
                    color: muted(50),
                  }}
                >
                  Setting the text…
                </div>
              )}
              {text && (
                <VirtualPages
                  count={text.pages.length}
                  scrollRef={scrollRef}
                  jumpTo={jump}
                  onVisible={onVisible}
                >
                  {(i) =>
                    book.viewMode === "page" && book.format === "pdf" ? (
                      <PdfPageCard
                        pdf={pdf}
                        pageNumber={Number(text.pages[i].number) || i + 1}
                        running={text.pages[i].running}
                      />
                    ) : (
                      <BookPageCard page={text.pages[i]} marks={marks} />
                    )
                  }
                </VirtualPages>
              )}
            </div>
          </section>
        </Panel>

        <PanelResizeHandle
          style={{
            flex: "none",
            width: 9,
            cursor: "col-resize",
            background: "var(--color-divider)",
            backgroundClip: "content-box",
            borderLeft: "4px solid var(--color-bg)",
            borderRight: "4px solid var(--color-bg)",
          }}
        />

        <Panel minSize={24}>
          <section
            className="dimmable"
            style={{
              height: "100%",
              minWidth: 0,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              opacity: dimJournal ? 0.3 : 1,
            }}
          >
            {draft ? (
              <Composer
                draft={draft}
                onSave={(v) => void save(v)}
                onDiscard={() => setDraft(null)}
              />
            ) : (
              <JournalPane
                entries={sorted}
                onNew={() => setDraft({ anchor: { kind: "free" } })}
                onJump={jumpToEntry}
              />
            )}
          </section>
        </Panel>
      </PanelGroup>
    </main>
  );
}
