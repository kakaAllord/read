import { OFFSET_ATTR } from "../lib/anchors";
import type { BookPage } from "../lib/types";

const muted = (pct: number) => `color-mix(in srgb, var(--color-text) ${pct}%, transparent)`;

export type Mark = { start: number; end: number };

type Props = {
  page: BookPage;
  marks: Mark[];
};

/* One card per source page, set in the app's own typography. The card is the
   page; the number printed on it is a label carried over from the file, not a
   position — an entry holds a character offset instead. */
export default function BookPageCard({ page, marks }: Props) {
  let paraIndex = 0;

  return (
    <div
      data-page={page.index}
      style={{
        width: "min(640px, calc(100% - 48px))",
        margin: "0 auto 34px",
        background: "var(--color-page)",
        border: "1px solid var(--color-divider)",
        boxShadow: "var(--shadow-sm)",
        padding: "66px 74px 54px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 10,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: muted(40),
          marginBottom: 34,
        }}
      >
        <div>{page.running}</div>
        <div style={{ fontVariantNumeric: "tabular-nums" }}>{page.number}</div>
      </div>

      {page.blocks.map((block, i) => {
        const end = block.offset + block.text.length;
        const hit = marks.some((m) => m.start < end && m.end > block.offset);
        const attrs = { [OFFSET_ATTR]: block.offset };

        if (block.kind === "heading") {
          return (
            <h3 key={i} className={`book-h${hit ? " marked" : ""}`} {...attrs}>
              {block.text}
            </h3>
          );
        }
        const indent = paraIndex++ === 0 ? "0" : "1.4em";
        return (
          <p
            key={i}
            className={`book-p${hit ? " marked" : ""}`}
            style={{ textIndent: indent }}
            {...attrs}
          >
            {block.text}
          </p>
        );
      })}
    </div>
  );
}
