import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";

import { db } from "../lib/db";
import { isPdf, type Progress } from "../lib/store";
import AddBookDialog from "../components/AddBookDialog";
import BookPlate from "../components/BookPlate";

const muted = (pct: number) => `color-mix(in srgb, var(--color-text) ${pct}%, transparent)`;

export default function Library() {
  const navigate = useNavigate();
  const [dragging, setDragging] = useState(false);
  const [dialogFile, setDialogFile] = useState<File | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const depth = useRef(0);

  const books = useLiveQuery(() => db.books.toArray(), [], undefined);
  const progress = useLiveQuery(async () => {
    const rows = await db.meta.toArray();
    const out: Record<string, Progress> = {};
    for (const r of rows) {
      if (r.key.startsWith("progress.")) out[r.key.slice(9)] = r.value as Progress;
    }
    return out;
  }, []);

  const genres = useMemo(() => {
    const bs = books ?? [];
    const prog = progress ?? {};
    const names: string[] = [];
    for (const b of bs) if (!names.includes(b.genre)) names.push(b.genre);
    return names.map((name) => ({
      name,
      count: bs.filter((b) => b.genre === name).length,
      books: bs
        .filter((b) => b.genre === name)
        .map((b) => {
          const p = prog[b.id];
          const pages = p?.pageCount ?? b.pageCount ?? 0;
          return {
            book: b,
            pct: pages ? `${Math.min(100, Math.round(((p?.page ?? 0) / pages) * 100))}%` : "0%",
          };
        }),
    }));
  }, [books, progress]);

  function accept(file: File | undefined) {
    if (!file) return;
    if (!isPdf(file.name, file.type)) {
      setError(`${file.name} is not a PDF.`);
      return;
    }
    setError(null);
    setDialogFile(file);
    setDialogOpen(true);
  }

  function openDialog() {
    setError(null);
    setDialogFile(null);
    setDialogOpen(true);
  }

  const isEmpty = (books ?? []).length === 0;

  return (
    <main
      style={{ flex: 1, overflow: "auto" }}
      onDragEnter={(e) => {
        e.preventDefault();
        depth.current++;
        setDragging(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!dragging) setDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        depth.current = 0;
        setDragging(false);
        accept(e.dataTransfer.files[0]);
      }}
    >
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "54px 30px 90px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 24,
            marginBottom: 40,
          }}
        >
          <h1 style={{ fontWeight: 400, fontSize: 44, margin: 0 }}>Library</h1>
          <button className="btn btn-primary" onClick={openDialog}>
            Upload a book
          </button>
        </div>

        <input
          ref={input}
          type="file"
          accept=".pdf,application/pdf"
          style={{ display: "none" }}
          onChange={(e) => {
            accept(e.target.files?.[0]);
            e.target.value = "";
          }}
        />

        <div
          onClick={() => input.current?.click()}
          style={{
            border: `1px dashed ${dragging ? "var(--color-accent)" : "var(--color-accent-400)"}`,
            borderRadius: "var(--radius-md)",
            padding: 30,
            textAlign: "center",
            marginBottom: 54,
            cursor: "pointer",
            background: dragging
              ? "color-mix(in srgb, var(--color-accent) 14%, transparent)"
              : "color-mix(in srgb, var(--color-accent) 5%, transparent)",
          }}
        >
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 19 }}>
            {dragging ? "Release to add this book" : "Drop a PDF anywhere on this page"}
          </div>
          <div style={{ fontSize: 12, color: muted(55), marginTop: 5 }}>
            The cover is rendered from page one. Title and author are read from the file where
            they exist.
          </div>
        </div>

        {error && (
          <div
            style={{
              fontSize: 13,
              color: "var(--color-accent-800)",
              background: "color-mix(in srgb, var(--color-accent) 12%, transparent)",
              border: "1px solid var(--color-accent-400)",
              borderRadius: "var(--radius-md)",
              padding: "10px 14px",
              marginBottom: 30,
            }}
          >
            {error}
          </div>
        )}

        {isEmpty && (
          <div style={{ fontSize: 14, fontStyle: "italic", color: muted(50) }}>
            No books yet. Genres appear as you add them.
          </div>
        )}

        {genres.map((g) => (
          <section key={g.name} style={{ marginBottom: 50 }}>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 12,
                borderBottom: "1px solid var(--color-divider)",
                paddingBottom: 8,
                marginBottom: 24,
              }}
            >
              <h2 style={{ fontWeight: 400, fontSize: 21, margin: 0 }}>{g.name}</h2>
              <div
                style={{
                  fontSize: 11,
                  fontVariantNumeric: "tabular-nums",
                  color: muted(45),
                }}
              >
                {g.count}
              </div>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))",
                gap: "30px 24px",
              }}
            >
              {g.books.map(({ book, pct }) => (
                <div
                  key={book.id}
                  onClick={() => navigate(`/book/${book.id}`)}
                  className="lift"
                  style={{ cursor: "pointer", maxWidth: 180 }}
                >
                  <BookPlate
                    book={book}
                    style={{
                      aspectRatio: "2 / 3",
                      padding: 14,
                      marginBottom: 12,
                      fontSize: 15,
                      lineHeight: 1.25,
                    }}
                  />
                  <div
                    style={{ fontFamily: "var(--font-heading)", fontSize: 16, lineHeight: 1.2 }}
                  >
                    {book.title}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      fontStyle: "italic",
                      color: muted(55),
                      marginBottom: 10,
                    }}
                  >
                    {book.author}
                  </div>
                  <div style={{ height: 2, background: "var(--color-neutral-300)" }}>
                    <div style={{ height: 2, background: "var(--color-accent)", width: pct }} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {dialogOpen && (
        <AddBookDialog
          file={dialogFile}
          onClose={() => {
            setDialogOpen(false);
            setDialogFile(null);
          }}
          onAdded={(id) => {
            setDialogOpen(false);
            setDialogFile(null);
            navigate(`/book/${id}`);
          }}
          onPickFile={() => input.current?.click()}
        />
      )}
    </main>
  );
}
