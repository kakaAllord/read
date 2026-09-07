import { unzipSync, strFromU8 } from "fflate";
import { normalizeText } from "./normalize";
import { coverFromImageBlob } from "./cover";
import type { Block, BookPage, BookText } from "../types";

/* EPUB is already semantic HTML: real paragraphs, real headings, real
   chapter boundaries. Every guess the PDF path has to make is answered by
   the file itself, so this reads the spine directly rather than rendering it. */

const BLOCKS_PER_PAGE = 9;

type Zip = Record<string, Uint8Array>;

function resolve(base: string, href: string): string {
  const stack = base.split("/").slice(0, -1);
  for (const part of href.split("/")) {
    if (part === "." || part === "") continue;
    if (part === "..") stack.pop();
    else stack.push(part);
  }
  return stack.join("/");
}

function parseXml(text: string, type: DOMParserSupportedType = "application/xml"): Document {
  return new DOMParser().parseFromString(text, type);
}

function read(zip: Zip, path: string): string | undefined {
  const bytes = zip[path] ?? zip[decodeURIComponent(path)];
  return bytes ? strFromU8(bytes) : undefined;
}

export type EpubMeta = {
  title?: string;
  author?: string;
  coverDataUrl?: string;
};

type Parsed = { text: BookText; meta: EpubMeta };

export async function extractEpub(data: ArrayBuffer, bookId: string): Promise<Parsed> {
  const zip = unzipSync(new Uint8Array(data)) as Zip;

  const container = read(zip, "META-INF/container.xml");
  if (!container) throw new Error("Not an EPUB — META-INF/container.xml is missing.");
  const opfPath = parseXml(container)
    .querySelector("rootfile")
    ?.getAttribute("full-path");
  if (!opfPath) throw new Error("This EPUB has no package document.");

  const opfText = read(zip, opfPath);
  if (!opfText) throw new Error("This EPUB's package document could not be read.");
  const opf = parseXml(opfText);

  const meta: EpubMeta = {
    title: opf.querySelector("metadata > *|title, title")?.textContent?.trim() || undefined,
    author: opf.querySelector("metadata > *|creator, creator")?.textContent?.trim() || undefined,
  };

  const manifest = new Map<string, { href: string; type: string; props: string }>();
  opf.querySelectorAll("manifest > item").forEach((el) => {
    const id = el.getAttribute("id");
    const href = el.getAttribute("href");
    if (!id || !href) return;
    manifest.set(id, {
      href: resolve(opfPath, href),
      type: el.getAttribute("media-type") ?? "",
      props: el.getAttribute("properties") ?? "",
    });
  });

  /* Cover: the EPUB 3 property, or the EPUB 2 <meta name="cover"> pointer. */
  let coverHref: string | undefined;
  for (const item of manifest.values()) {
    if (item.props.split(/\s+/).includes("cover-image")) coverHref = item.href;
  }
  if (!coverHref) {
    const id = opf.querySelector('metadata > meta[name="cover"]')?.getAttribute("content");
    if (id) coverHref = manifest.get(id)?.href;
  }
  if (coverHref && zip[coverHref]) {
    const bytes = zip[coverHref];
    const copy = new Uint8Array(bytes);
    meta.coverDataUrl = await coverFromImageBlob(new Blob([copy]));
  }

  const spine: string[] = [];
  opf.querySelectorAll("spine > itemref").forEach((el) => {
    const idref = el.getAttribute("idref");
    if (!idref) return;
    if (el.getAttribute("linear") === "no") return;
    const item = manifest.get(idref);
    if (item && /html|xml/.test(item.type)) spine.push(item.href);
  });

  const pages: BookPage[] = [];
  const parts: string[] = [];
  const chapters: string[] = [];
  let cursor = 0;
  let pageNumber = 0;

  for (const href of spine) {
    const html = read(zip, href);
    if (!html) continue;
    const doc = parseXml(html, "application/xhtml+xml");
    const body = doc.body ?? doc.documentElement;
    if (!body) continue;

    const blocks: Block[] = [];
    body.querySelectorAll("h1,h2,h3,h4,h5,h6,p,li,blockquote").forEach((el) => {
      if (el.closest("nav")) return;
      const text = normalizeText(el.textContent ?? "");
      if (!text) return;
      const kind: Block["kind"] = /^h[1-6]$/i.test(el.tagName) ? "heading" : "para";
      blocks.push({ kind, text, offset: 0, indent: false });
    });
    if (blocks.length === 0) continue;

    const chapter =
      blocks.find((b) => b.kind === "heading")?.text ??
      doc.querySelector("title")?.textContent?.trim() ??
      "";
    if (chapter && !chapters.includes(chapter)) chapters.push(chapter);

    for (let i = 0; i < blocks.length; i += BLOCKS_PER_PAGE) {
      const slice = blocks.slice(i, i + BLOCKS_PER_PAGE);
      const pageOffset = cursor;
      for (const b of slice) {
        b.offset = cursor;
        parts.push(b.text);
        cursor += b.text.length + 2;
      }
      pageNumber++;
      pages.push({
        index: pages.length,
        number: pageNumber,
        running: chapter,
        offset: pageOffset,
        blocks: slice,
      });
    }
  }

  if (pages.length === 0) throw new Error("No readable text was found in this EPUB.");

  return { text: { bookId, pages, fullText: parts.join("\n\n"), chapters }, meta };
}
