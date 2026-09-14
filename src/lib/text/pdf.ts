import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { PDFDocumentProxy } from "pdfjs-dist";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export function openPdf(data: ArrayBuffer): Promise<PDFDocumentProxy> {
  /* pdf.js transfers the buffer to the worker, so hand it a copy — the same
     bytes are wanted again for the upload and the cache. */
  return pdfjs.getDocument({ data: data.slice(0) }).promise;
}

/* The layer of transparent, positioned spans that makes a drawn page
   selectable. Same class the Firefox viewer uses. */
export { TextLayer } from "pdfjs-dist";

export type { PDFDocumentProxy };
