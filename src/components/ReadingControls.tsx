import { useEffect, useRef, useState } from "react";
import { usePrefs } from "../hooks/usePrefs";
import { TEXT_SIZES, type Theme } from "../lib/prefs";

/* The mockup draws no reading controls; 15.5px is fine for scanning a page
   and small for an hour of it, so this adds the two the brief asks for.
   It is built from the toolbar's existing parts — the .chip border and fill,
   the 11px tracked caps, the accent for the current choice — and it sits in
   the same row as the focus chip rather than floating over the text. */

const THEMES: { id: Theme; label: string; swatch: string; ink: string }[] = [
  { id: "default", label: "Paper", swatch: "#f3f2f2", ink: "#201f1d" },
  { id: "sepia", label: "Sepia", swatch: "#ece2d0", ink: "#2b2317" },
  { id: "dark", label: "Night", swatch: "#1a1918", ink: "#e9e4dc" },
];

export default function ReadingControls() {
  const [prefs, setPrefs] = usePrefs();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const step = TEXT_SIZES.indexOf(prefs.textSize as (typeof TEXT_SIZES)[number]);

  return (
    <div ref={wrap} style={{ position: "relative", flex: "none" }}>
      <div
        onClick={() => setOpen((o) => !o)}
        className="chip"
        title="Text size and theme"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          padding: "4px 11px",
          border: `1px solid ${open ? "var(--color-accent)" : "var(--color-divider)"}`,
          borderRadius: "var(--radius-md)",
          cursor: "pointer",
          userSelect: "none",
          background: open ? "color-mix(in srgb, var(--color-accent) 9%, transparent)" : "transparent",
          color: open
            ? "var(--color-accent-800)"
            : "color-mix(in srgb, var(--color-text) 55%, transparent)",
        }}
      >
        <span style={{ fontFamily: "var(--font-heading)", fontSize: 15, lineHeight: 1 }}>A</span>
        <span style={{ fontFamily: "var(--font-heading)", fontSize: 10.5, lineHeight: 1 }}>A</span>
      </div>

      {open && (
        <div className="rc-pop">
          <div>
            <div className="rc-label">Text size</div>
            <div className="rc-steps">
              {TEXT_SIZES.map((size, i) => (
                <button
                  key={size}
                  className="rc-step"
                  aria-pressed={step === i}
                  onClick={() => setPrefs({ textSize: size })}
                  style={{ fontSize: 11 + i * 1.5 }}
                >
                  A
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="rc-label">Theme</div>
            <div className="rc-steps">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  className="rc-step"
                  aria-pressed={prefs.theme === t.id}
                  onClick={() => setPrefs({ theme: t.id })}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    fontSize: 11,
                  }}
                >
                  <span
                    className="rc-swatch"
                    style={{ background: t.swatch, boxShadow: `inset 0 -6px 0 -3px ${t.ink}` }}
                  />
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
