import { useEffect, useRef, useState } from "react";
import { useSpeech } from "../hooks/useSpeech";
import { countWords } from "../lib/words";
import type { Anchor, EntryKind } from "../lib/types";

const muted = (pct: number) => `color-mix(in srgb, var(--color-text) ${pct}%, transparent)`;

export type ComposerDraft = {
  kind: EntryKind;
  anchor: Anchor;
  excerpt?: string;
  displayLocation?: string;
};

/* A question is asked, not titled, and what goes under it is only whatever
   you already half-know. Saying so in the placeholders is the whole of the
   difference — the same composer, pointed at a different thing. */
const WORDING: Record<EntryKind, { heading: string; body: string; free: string }> = {
  note: {
    heading: "Heading",
    body: "Write.",
    free: "Free-standing entry — no passage attached.",
  },
  question: {
    heading: "What do you want to find out?",
    body: "Anything you already suspect, and where you would start.",
    free: "Question with no passage attached.",
  },
  highlight: {
    heading: "Heading",
    body: "Write.",
    free: "Free-standing entry — no passage attached.",
  },
};

type Props = {
  draft: ComposerDraft;
  onSave: (v: { title: string; body: string; source: "typed" | "spoken" | "mixed" }) => void;
  onDiscard: () => void;
};

export default function Composer({ draft, onSave, onDiscard }: Props) {
  const wording = WORDING[draft.kind];
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const typed = useRef(false);
  const spoke = useRef(false);
  const heading = useRef<HTMLInputElement>(null);

  /* The excerpt and the anchor arrive already attached; the cursor belongs in
     the heading, which is the only thing the writer still has to supply. */
  useEffect(() => {
    const id = setTimeout(() => heading.current?.focus(), 40);
    return () => clearTimeout(id);
  }, []);

  const speech = useSpeech((chunk) => {
    spoke.current = true;
    /* Stored raw. No auto-punctuation, no tidying — a silent rewrite would
       eventually change something that was meant. */
    setBody((prev) => (prev ? `${prev} ${chunk}` : chunk));
  });

  function save() {
    const source =
      typed.current && spoke.current ? "mixed" : spoke.current ? "spoken" : "typed";
    onSave({ title, body, source });
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onDiscard();
      } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const words = countWords(body);
  const listening = speech.listening;

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div
        style={{
          flex: "none",
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 26px",
          borderBottom: "1px solid var(--color-divider)",
        }}
      >
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--color-accent-700)",
            marginRight: "auto",
          }}
        >
          New entry
        </div>
        <div style={{ fontSize: 11, fontVariantNumeric: "tabular-nums", color: muted(45) }}>
          {words} words
        </div>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "30px 26px 26px" }}>
        <div style={{ maxWidth: 560 }}>
          {draft.excerpt ? (
            <div
              style={{
                borderLeft: "2px solid var(--color-accent)",
                padding: "2px 0 2px 16px",
                marginBottom: 24,
              }}
            >
              <div
                style={{
                  fontSize: 14.5,
                  lineHeight: 1.7,
                  fontStyle: "italic",
                  color: muted(78),
                }}
              >
                {draft.excerpt}
              </div>
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  marginTop: 8,
                  color: muted(45),
                }}
              >
                {draft.displayLocation}
              </div>
            </div>
          ) : (
            <div
              style={{
                fontSize: 12,
                fontStyle: "italic",
                marginBottom: 24,
                color: muted(45),
              }}
            >
              {wording.free}
            </div>
          )}

          <input
            ref={heading}
            value={title}
            onChange={(e) => {
              typed.current = true;
              setTitle(e.target.value);
            }}
            placeholder={wording.heading}
            style={{
              width: "100%",
              border: 0,
              borderBottom: "1px solid var(--color-divider)",
              background: "transparent",
              fontFamily: "var(--font-heading)",
              fontSize: 27,
              lineHeight: 1.2,
              padding: "0 0 10px",
              marginBottom: 20,
              color: "var(--color-text)",
              caretColor: "var(--color-accent)",
            }}
          />
          <textarea
            value={body}
            onChange={(e) => {
              typed.current = true;
              setBody(e.target.value);
            }}
            placeholder={wording.body}
            style={{
              width: "100%",
              minHeight: 240,
              border: 0,
              background: "transparent",
              fontFamily: "var(--font-body)",
              fontSize: 15.5,
              lineHeight: 1.8,
              resize: "none",
              padding: 0,
              color: "var(--color-text)",
              caretColor: "var(--color-accent)",
            }}
          />
        </div>
      </div>

      <div
        style={{
          flex: "none",
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 26px",
          borderTop: "1px solid var(--color-divider)",
        }}
      >
        <div
          onMouseDown={(e) => e.preventDefault() /* keep the caret in the body */}
          onClick={() => {
            if (!speech.supported) return;
            if (listening) speech.stop();
            else speech.start();
          }}
          title={
            speech.supported
              ? "Press to speak, press again to stop — the transcript is stored exactly as it comes back"
              : "This browser has no speech recognition"
          }
          style={{
            display: "inline-flex",
            flex: "none",
            alignItems: "center",
            gap: 8,
            padding: "7px 14px",
            border: `1px solid ${listening ? "var(--color-accent)" : "var(--color-divider)"}`,
            borderRadius: 999,
            cursor: speech.supported ? "pointer" : "not-allowed",
            userSelect: "none",
            fontSize: 12,
            whiteSpace: "nowrap",
            opacity: speech.supported ? 1 : 0.5,
            color: listening ? "var(--color-accent-800)" : muted(60),
            background: listening
              ? "color-mix(in srgb, var(--color-accent) 12%, transparent)"
              : "transparent",
          }}
        >
          <div
            style={{
              width: 7,
              height: 7,
              flex: "none",
              borderRadius: "50%",
              background: listening ? "var(--color-accent)" : "var(--color-neutral-400)",
              animation: listening ? "rec 1.1s ease-in-out infinite" : "none",
            }}
          />
          <div style={{ whiteSpace: "nowrap" }}>
            {listening ? "Listening — press to stop" : "Press to speak"}
          </div>
        </div>
        <div
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 11,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            color: speech.error ? "var(--color-accent-800)" : muted(42),
          }}
        >
          {speech.error ?? "Ctrl+Enter saves · Esc discards"}
        </div>
        <button
          className="btn btn-secondary"
          onClick={onDiscard}
          style={{ flex: "none", whiteSpace: "nowrap" }}
        >
          Discard
        </button>
        <button
          className="btn btn-primary"
          onClick={save}
          style={{ flex: "none", whiteSpace: "nowrap" }}
        >
          Save
        </button>
      </div>
    </div>
  );
}
