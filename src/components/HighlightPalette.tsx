import { useEffect, useRef, useState } from "react";
import { COLORS, COLOR_NAMES, type HighlightColor, type Legend } from "../lib/types";

const muted = (pct: number) => `color-mix(in srgb, var(--color-text) ${pct}%, transparent)`;

type Props = {
  /* Where the selection is, in viewport coordinates, so the palette opens on
     the words it is about to colour rather than somewhere off to the side. */
  at: { left: number; top: number; bottom: number };
  current?: HighlightColor;
  legend: Legend;
  onPick: (color: HighlightColor) => void;
  onRemove: () => void;
  onLegend: (legend: Legend) => void;
  onClose: () => void;
};

const SIZE = 26;

/**
 * The colours, on the passage, the moment H is pressed.
 *
 * Every reading app puts a row of swatches at the selection and every one of
 * them stops there, which leaves what a colour means in your head — and a
 * colour system kept in your head is one you stop keeping. So the swatches
 * carry their names, and the names can be written here.
 *
 * The number keys pick, because the hand is already on the keyboard: H opened
 * this, and 1 to 5 is faster than reaching for the mouse to close it.
 */
export default function HighlightPalette({
  at,
  current,
  legend,
  onPick,
  onRemove,
  onLegend,
  onClose,
}: Props) {
  const [naming, setNaming] = useState(false);
  const [draft, setDraft] = useState<Legend>(legend);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (naming) {
          setNaming(false);
          setDraft(legend);
        } else onClose();
        return;
      }
      if (naming) return; /* the inputs own the keyboard while they are open */

      const n = Number(e.key);
      if (n >= 1 && n <= 5) {
        e.preventDefault();
        e.stopPropagation();
        onPick(n as HighlightColor);
        return;
      }
      if ((e.key === "Backspace" || e.key === "0") && current) {
        e.preventDefault();
        e.stopPropagation();
        onRemove();
      }
    };
    /* Capture, so this runs before the reader's own shortcuts see the key. */
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [naming, legend, current, onPick, onRemove, onClose]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [onClose]);

  /* Above the selection where there is room, below it where there is not. */
  const above = at.top > 220;
  const width = naming ? 260 : COLORS.length * (SIZE + 10) + (current ? 86 : 34) + 24;

  return (
    <div
      ref={box}
      style={{
        position: "fixed",
        left: Math.max(12, Math.min(window.innerWidth - width - 12, at.left - width / 2)),
        top: above ? at.top - (naming ? 236 : 62) : at.bottom + 10,
        width,
        zIndex: 60,
        background: "var(--color-surface)",
        border: "1px solid var(--color-divider)",
        borderRadius: "var(--radius-md)",
        boxShadow: "var(--shadow-md, 0 8px 28px rgba(0,0,0,0.16))",
        padding: naming ? "14px 14px 10px" : "10px 12px",
      }}
    >
      {naming ? (
        <>
          <div
            style={{
              fontSize: 10.5,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: muted(50),
              marginBottom: 10,
            }}
          >
            What each colour means
          </div>
          {COLORS.map((c) => (
            <div key={c} style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 7 }}>
              <Swatch color={c} />
              <input
                value={draft[c] ?? ""}
                onChange={(e) => setDraft({ ...draft, [c]: e.target.value })}
                placeholder={COLOR_NAMES[c]}
                style={{
                  flex: 1,
                  minWidth: 0,
                  border: 0,
                  borderBottom: "1px solid var(--color-divider)",
                  background: "transparent",
                  fontFamily: "var(--font-body)",
                  fontSize: 13,
                  padding: "3px 0",
                  color: "var(--color-text)",
                  caretColor: "var(--color-accent)",
                }}
              />
            </div>
          ))}
          <div style={{ display: "flex", gap: 14, justifyContent: "flex-end", marginTop: 10 }}>
            <span
              onClick={() => {
                setNaming(false);
                setDraft(legend);
              }}
              style={{ fontSize: 12, cursor: "pointer", color: muted(55) }}
            >
              Cancel
            </span>
            <span
              onClick={() => {
                const cleaned: Legend = {};
                for (const c of COLORS) {
                  const name = draft[c]?.trim();
                  if (name) cleaned[c] = name;
                }
                onLegend(cleaned);
                setNaming(false);
              }}
              style={{ fontSize: 12, cursor: "pointer", color: "var(--color-accent-700)" }}
            >
              Save
            </span>
          </div>
        </>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {COLORS.map((c) => (
            <div
              key={c}
              onClick={() => onPick(c)}
              title={`${legend[c] ?? COLOR_NAMES[c]}  (${c})`}
              style={{ cursor: "pointer", lineHeight: 0 }}
            >
              <Swatch color={c} selected={c === current} />
            </div>
          ))}

          {current && (
            <span
              onClick={onRemove}
              title="Remove this highlight  (Backspace)"
              style={{
                fontSize: 12,
                cursor: "pointer",
                color: muted(55),
                paddingLeft: 4,
                whiteSpace: "nowrap",
              }}
            >
              Remove
            </span>
          )}

          <span
            onClick={() => setNaming(true)}
            title="Say what each colour means"
            style={{
              marginLeft: "auto",
              fontSize: 15,
              lineHeight: 1,
              cursor: "pointer",
              color: muted(45),
            }}
          >
            ⋯
          </span>
        </div>
      )}
    </div>
  );
}

function Swatch({ color, selected }: { color: HighlightColor; selected?: boolean }) {
  return (
    <div
      style={{
        width: SIZE,
        height: SIZE,
        flex: "none",
        borderRadius: "50%",
        background: `var(--hl-${color})`,
        border: selected
          ? "2px solid var(--color-text)"
          : "1px solid color-mix(in srgb, var(--color-text) 22%, transparent)",
        boxShadow: selected ? "0 0 0 2px var(--color-surface) inset" : "none",
      }}
    />
  );
}
