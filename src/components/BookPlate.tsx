import type { CSSProperties } from "react";
import type { Book } from "../lib/types";

/* The .plate treatment from the design system — a 6px surface mount, a
   hairline outline and a slight sepia wash. The mockup sets the title into
   the plate because it had no cover art; here the rendered page one goes in
   when there is one, and the title stays as the fallback for the moment
   before it exists. */

type Props = {
  book: Pick<Book, "title" | "coverDataUrl">;
  style?: CSSProperties;
};

export default function BookPlate({ book, style }: Props) {
  const hasCover = Boolean(book.coverDataUrl);
  return (
    <div
      className="plate"
      style={{
        background: "var(--color-neutral-200)",
        display: "flex",
        alignItems: "flex-end",
        fontFamily: "var(--font-heading)",
        position: "relative",
        overflow: "hidden",
        ...style,
        ...(hasCover ? { padding: 0 } : null),
      }}
    >
      {hasCover ? (
        <img
          src={book.coverDataUrl}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        book.title
      )}
    </div>
  );
}
