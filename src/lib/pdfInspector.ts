/**
 * Thin wrapper around Firecrawl's `pdf-inspector` (Rust → WASM).
 * Runs entirely in the browser — PDF bytes never leave the device.
 * https://github.com/firecrawl/pdf-inspector
 */

export type PdfClassificationType = "TextBased" | "Scanned" | "ImageBased" | "Mixed";

export interface InspectedPdf {
  /** Clean Markdown extracted from the document (empty for scanned/image-only PDFs). */
  markdown: string;
  pdfType: PdfClassificationType;
  pageCount: number;
  /** 0.0–1.0 classification confidence. */
  confidence: number;
  /** 1-indexed pages that look like they need OCR (no extractable text). */
  pagesNeedingOcr: number[];
}

type PdfInspectorModule = typeof import("@firecrawl/pdf-inspector-wasm");

let modulePromise: Promise<PdfInspectorModule> | null = null;
let initPromise: Promise<unknown> | null = null;

async function loadPdfInspector(): Promise<PdfInspectorModule> {
  if (!modulePromise) {
    modulePromise = import("@firecrawl/pdf-inspector-wasm");
  }
  const mod = await modulePromise;
  if (!initPromise) {
    initPromise = mod.default();
  }
  await initPromise;
  return mod;
}

/**
 * Classify and parse a PDF into structured Markdown using Firecrawl's pdf-inspector.
 * Throws if the file cannot be loaded as a PDF at all; returns empty `markdown` for
 * scanned/image-only documents (check `pdfType` / `pagesNeedingOcr`).
 */
export async function inspectPdf(file: File): Promise<InspectedPdf> {
  const mod = await loadPdfInspector();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = mod.processPdf(bytes, { profile: "fidelity", includePageMarkers: true });

  return {
    markdown: result.markdown ?? "",
    pdfType: result.pdfType,
    pageCount: result.pageCount,
    confidence: result.confidence,
    pagesNeedingOcr: result.pagesNeedingOcr ?? [],
  };
}
