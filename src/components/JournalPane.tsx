import { shortDate } from "../lib/dates";
import { COLOR_NAMES, type Entry, type Legend } from "../lib/types";

const muted = (pct: number) => `color-mix(in srgb, var(--color-text) ${pct}%, transparent)`;

type Props = {
  entries: Entry[];
  legend: Legend;
  onNew: () => void;
  onJump: (entry: Entry) => void;
};

/* What a passage was marked with, said in the fewest words that distinguish
   it. A highlight has no heading of its own — it is the passage — so the
   quote below carries it and this only says why it is there. */
function labelOf(e: Entry, legend: Legend): string | null {
  if (e.kind === "bookmark") return "Bookmark";
  if (e.kind === "highlight") {
    const c = e.color ?? 1;
    /* What the colour was decided to mean, where that has been decided, and
       the colour's own name where it has not. */
    return legend[c] ?? COLOR_NAMES[c];
  }
  if (e.kind === "question") return e.status === "answered" ? "Answered" : "Question";
  return null;
}

/* Book view: everything written against this book, newest first. */
export default function JournalPane({ entries, legend, onNew, onJump }: Props) {
  const count = entries.length === 1 ? "1 entry" : `${entries.length} entries`;

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div
        style={{
          flex: "none",
          display: "flex",
          alignItems: "baseline",
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
            color: muted(50),
            marginRight: "auto",
          }}
        >
          Journal · {count}
        </div>
        <div
          onClick={onNew}
          style={{ fontSize: 12, color: "var(--color-accent-700)", cursor: "pointer" }}
        >
          New entry
        </div>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "26px 26px 60px" }}>
        {entries.length === 0 && (
          <div
            style={{
              maxWidth: 340,
              paddingTop: 40,
              fontSize: 14,
              lineHeight: 1.7,
              fontStyle: "italic",
              color: muted(50),
            }}
          >
            Nothing written against this book yet. Select a passage on the left and press E to
            write about it, H to highlight it, or Q to ask something you want to go and find out.
          </div>
        )}

        {entries.map((e) => (
          <article
            key={e.id}
            className="rise"
            style={{
              paddingBottom: 26,
              marginBottom: 26,
              borderBottom: "1px solid var(--color-divider)",
              maxWidth: 620,
            }}
          >
            <div
              style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 10 }}
            >
              {e.kind === "highlight" || e.kind === "bookmark" ? (
                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 11,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: muted(45),
                  }}
                >
                  {e.kind === "highlight" && (
                    <span
                      style={{
                        display: "inline-block",
                        width: 9,
                        height: 9,
                        borderRadius: "50%",
                        marginRight: 7,
                        verticalAlign: "baseline",
                        background: `var(--hl-${e.color ?? 1})`,
                      }}
                    />
                  )}
                  {labelOf(e, legend)}
                </div>
              ) : (
                <h4 style={{ fontWeight: 400, fontSize: 21, margin: 0, flex: 1, minWidth: 0 }}>
                  {e.title || "Untitled"}
                </h4>
              )}
              {e.kind === "question" && (
                <div
                  style={{
                    fontSize: 10.5,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color:
                      e.status === "answered" ? muted(42) : "var(--color-accent-700)",
                  }}
                >
                  {labelOf(e, legend)}
                </div>
              )}
              <div
                style={{
                  fontSize: 11,
                  fontVariantNumeric: "tabular-nums",
                  color: muted(42),
                }}
              >
                {shortDate(e.createdAt)}
              </div>
            </div>

            {e.excerpt && (
              <div
                onClick={() => onJump(e)}
                style={{
                  borderLeft: "2px solid var(--color-accent-300)",
                  paddingLeft: 14,
                  marginBottom: 12,
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    fontSize: 13.5,
                    lineHeight: 1.65,
                    fontStyle: "italic",
                    color: muted(68),
                  }}
                >
                  {e.excerpt}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    marginTop: 6,
                    color: "var(--color-accent-700)",
                  }}
                >
                  {e.displayLocation}
                </div>
              </div>
            )}

            <p style={{ fontSize: 15, lineHeight: 1.75, margin: 0, whiteSpace: "pre-wrap" }}>
              {e.body}
            </p>
          </article>
        ))}
      </div>

      <div
        style={{
          flex: "none",
          padding: "9px 26px",
          borderTop: "1px solid var(--color-divider)",
          fontSize: 11,
          color: muted(42),
        }}
      >
        Select a passage, then press E · Ctrl+Enter also opens the composer
      </div>
    </div>
  );
}
