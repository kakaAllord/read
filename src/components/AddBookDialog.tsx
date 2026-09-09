import { useEffect, useRef, useState } from "react";

import { commitBook, probeFile, type Probe } from "../lib/store";
import { connected } from "../lib/github/config";
import { genreDir } from "../lib/github/paths";
import type { ViewMode } from "../lib/types";

const muted = (pct: number) => `color-mix(in srgb, var(--color-text) ${pct}%, transparent)`;

type Props = {
  file: File | null;
  onClose: () => void;
  onAdded: (bookId: string) => void;
  onPickFile: () => void;
};

export default function AddBookDialog({ file, onClose, onAdded, onPickFile }: Props) {
  const [probe, setProbe] = useState<Probe | null>(null);
  const [mode, setMode] = useState<ViewMode>("reflow");
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [genre, setGenre] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [fraction, setFraction] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const token = useRef(0);

  /* The file is read before the dialog can be filled in, so the fields are
     pre-filled from what the file actually says rather than left blank. */
  useEffect(() => {
    if (!file) return;
    const mine = ++token.current;
    setError(null);
    setProbe(null);
    setFraction(0);
    setStatus("Reading the file");
    probeFile(file, file.name, (f, label) => {
      if (token.current !== mine) return;
      setFraction(f);
      setStatus(label);
    })
      .then((p) => {
        if (token.current !== mine) return;
        setProbe(p);
        setMode(p.verdict.mode);
        setTitle(p.title);
        setAuthor(p.author ?? "");
        setStatus(null);
        setFraction(null);
      })
      .catch((err: unknown) => {
        if (token.current !== mine) return;
        setError(err instanceof Error ? err.message : String(err));
        setStatus(null);
        setFraction(null);
      });
  }, [file]);

  async function add() {
    if (!probe || saving) return;
    setSaving(true);
    setError(null);
    setStatus("Adding");
    setFraction(0);
    try {
      const book = await commitBook({ ...probe, verdict: { ...probe.verdict, mode } }, {
        title,
        author,
        genre,
      }, setFraction);
      onAdded(book.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
      setStatus(null);
      setFraction(null);
    }
  }

  const body = probe
    ? `${probe.fileName} — ${probe.coverDataUrl ? "page one rendered, " : ""}${probe.pageCount} pages`
    : status
      ? status
      : "Choose a file, or drop one on the page. Fields pre-fill from the filename and the file's metadata.";

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div className="dialog">
        <div className="dialog-title">Add a book</div>
        <div className="dialog-body">{body}</div>

        {fraction !== null && (
          <div style={{ height: 2, background: "var(--color-neutral-300)" }}>
            <div
              style={{
                height: 2,
                background: "var(--color-accent)",
                width: `${Math.round(fraction * 100)}%`,
                transition: "width .2s ease",
              }}
            />
          </div>
        )}

        {!probe && !status && (
          <div
            onClick={onPickFile}
            style={{
              fontSize: 12,
              color: "var(--color-accent-700)",
              cursor: "pointer",
              textDecoration: "underline",
              textUnderlineOffset: 3,
              width: "fit-content",
            }}
          >
            Choose a file
          </div>
        )}

        <div className="field">
          <label>Title</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label>Author</label>
          <input className="input" value={author} onChange={(e) => setAuthor(e.target.value)} />
        </div>
        <div className="field">
          <label>Genre</label>
          <input
            className="input"
            value={genre}
            onChange={(e) => setGenre(e.target.value)}
            placeholder="faith, leadership, detective…"
          />
          {/* The genre is a folder name in the repo, not just a heading on
              the shelf, so it is worth saying where the file lands. */}
          <div style={{ fontSize: 11, lineHeight: 1.6, color: muted(48), marginTop: 4 }}>
            {connected()
              ? `Will be filed under ${genreDir(genre.trim() || "unfiled")}/ the next time you save.`
              : "Connect a repository to keep a copy outside this browser."}
          </div>
        </div>

        {/* Which of the two view modes the book landed in, and why — with the
            override, because the detection is a judgement and can be wrong. */}
        {probe && (
          <div
            style={{
              fontSize: 12,
              lineHeight: 1.6,
              color: muted(62),
              borderLeft: "2px solid var(--color-accent-300)",
              paddingLeft: 12,
            }}
          >
            {probe.verdict.reason}
            <div style={{ marginTop: 6 }}>
              <span
                onClick={() => setMode(mode === "reflow" ? "page" : "reflow")}
                style={{
                  color: "var(--color-accent-700)",
                  cursor: "pointer",
                  textDecoration: "underline",
                  textUnderlineOffset: 3,
                }}
              >
                {mode === "reflow" ? "Show the pages instead" : "Reflow the text instead"}
              </span>
            </div>
          </div>
        )}

        {error && (
          <div style={{ fontSize: 12, lineHeight: 1.6, color: "var(--color-accent-800)" }}>
            {error}
          </div>
        )}

        <div className="dialog-actions">
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={() => void add()}
            disabled={!probe || saving}
          >
            Add to library
          </button>
        </div>
      </div>
    </div>
  );
}
