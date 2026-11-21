// Browser-side helpers: turn an uploaded PDF or photos into page images
// with their text positions, and cut question pictures out of them.
import type { PageData, Piece, TextItem } from "./detect";

export type LoadedPage = PageData & { canvas: HTMLCanvasElement; preview: string };
export type Progress = (message: string) => void;

const TARGET_WIDTH = 1400; // pixels per page width: sharp enough for small print
const MAX_PAGES = 80;

export async function loadFiles(files: File[], progress: Progress): Promise<LoadedPage[]> {
  const isPdf = (f: File) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);
  const isImage = (f: File) => /^image\/(png|jpeg|webp)$/.test(f.type) || /\.(png|jpe?g|webp)$/i.test(f.name);
  const pdfs = files.filter(isPdf);
  if (pdfs.length > 1 || (pdfs.length === 1 && files.length > 1)) {
    throw new Error("Upload one PDF, or several photos, at a time.");
  }
  if (pdfs.length === 1) return loadPdf(pdfs[0], progress);
  if (!files.every(isImage)) {
    throw new Error("Only PDF, JPG and PNG files can be split. For a Word file, use File → Save As → PDF in Word, then upload the PDF.");
  }
  const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const pages: LoadedPage[] = [];
  for (const [i, f] of sorted.entries()) {
    progress(`Reading photo ${i + 1} of ${sorted.length}…`);
    pages.push(await loadImage(f));
  }
  return ocrPages(pages, progress);
}

async function loadPdf(file: File, progress: Progress): Promise<LoadedPage[]> {
  progress("Opening the PDF…");
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  if (doc.numPages > MAX_PAGES) throw new Error(`This PDF has ${doc.numPages} pages. Please upload at most ${MAX_PAGES}.`);
  const pages: LoadedPage[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    progress(`Reading page ${n} of ${doc.numPages}…`);
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(3, Math.max(1.5, TARGET_WIDTH / base.width)) });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;

    const content = await page.getTextContent();
    const items: TextItem[] = [];
    for (const raw of content.items) {
      if (!("str" in raw) || !raw.str.trim()) continue;
      const m = pdfjs.Util.transform(viewport.transform, raw.transform);
      const h = Math.hypot(m[2], m[3]);
      if (!h) continue;
      items.push({ x: m[4], y: m[5] - h, w: raw.width * viewport.scale, h, text: raw.str });
    }
    const chars = items.reduce((s, i) => s + i.text.length, 0);
    pages.push({
      width: canvas.width, height: canvas.height, items,
      source: chars > 40 ? "text" : "none",
      canvas, preview: canvas.toDataURL("image/jpeg", 0.75),
    });
  }
  // Pages with no text layer are scans: read them with OCR.
  return ocrPages(pages, progress);
}

async function loadImage(file: File): Promise<LoadedPage> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1800 / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return {
    width: canvas.width, height: canvas.height, items: [], source: "none",
    canvas, preview: canvas.toDataURL("image/jpeg", 0.75),
  };
}

// Text recognition for scans and photos. Tesseract downloads its English
// model (about 10 MB) the first time, so this needs internet.
async function ocrPages(pages: LoadedPage[], progress: Progress): Promise<LoadedPage[]> {
  // A PDF whose pages mostly have text is not a scan: its few empty
  // pages (cover art, blank pages) need no recognition.
  const withText = pages.filter((p) => p.source === "text").length;
  if (withText >= pages.length / 2) return pages;
  const todo = pages.filter((p) => p.source === "none");
  if (!todo.length) return pages;
  progress("Loading text recognition (first time takes a minute)…");
  let worker: Awaited<ReturnType<typeof import("tesseract.js")["createWorker"]>> | null = null;
  try {
    const { createWorker } = await import("tesseract.js");
    worker = await createWorker("eng");
    for (const [i, p] of todo.entries()) {
      progress(`Recognising text on scanned page ${i + 1} of ${todo.length}…`);
      const { data } = await worker.recognize(p.canvas, {}, { blocks: true });
      const items: TextItem[] = [];
      for (const b of data.blocks ?? []) {
        for (const para of b.paragraphs) {
          for (const line of para.lines) {
            for (const w of line.words) {
              if (!w.text.trim()) continue;
              items.push({ x: w.bbox.x0, y: w.bbox.y0, w: w.bbox.x1 - w.bbox.x0, h: w.bbox.y1 - w.bbox.y0, text: w.text });
            }
          }
        }
      }
      p.items = items;
      p.source = "ocr";
    }
  } catch {
    // No OCR (offline, blocked download): the admin can still place the
    // cut lines by hand, so carry on without text.
    progress("Text recognition is not available. You can mark the questions by hand.");
  } finally {
    await worker?.terminate();
  }
  return pages;
}

const WHITE = 235;
const pixelCache = new WeakMap<HTMLCanvasElement, Uint8ClampedArray>();

function pagePixels(page: LoadedPage) {
  let data = pixelCache.get(page.canvas);
  if (!data) {
    data = page.canvas.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, page.width, page.height).data;
    pixelCache.set(page.canvas, data);
  }
  return data;
}

const dark = (d: Uint8ClampedArray, i: number) => d[i] < WHITE || d[i + 1] < WHITE || d[i + 2] < WHITE;

// Vertical ruled lines near the left or right edge of a column (the
// divider between columns, a page border): pixel columns that are dark
// for much of the height. They are not part of the question.
function ruleColumns(data: Uint8ClampedArray, width: number, x0: number, x1: number, y0: number, y1: number) {
  const edge = Math.max(6, Math.round((x1 - x0) * 0.08));
  const xs = new Set<number>();
  const check = (x: number) => {
    let n = 0;
    for (let y = y0; y < y1; y++) if (dark(data, (y * width + x) * 4)) n++;
    if (n > 0.3 * (y1 - y0)) xs.add(x);
  };
  for (let x = x0; x < Math.min(x1, x0 + edge); x++) check(x);
  for (let x = Math.max(x0, x1 - edge); x < x1; x++) check(x);
  return xs;
}

function inkRows(data: Uint8ClampedArray, width: number, x0: number, x1: number, y0: number, y1: number, skip: Set<number>) {
  let first = -1;
  let last = -1;
  for (let y = y0; y < y1; y++) {
    const row = y * width * 4;
    for (let x = x0; x < x1; x++) {
      if (skip.has(x)) continue;
      if (dark(data, row + x * 4)) {
        if (first < 0) first = y;
        last = y;
        break;
      }
    }
  }
  return first < 0 ? null : [first, last + 1];
}

// Cuts one question out of the page images: each piece is trimmed to its
// printed rows, pieces are stacked top to bottom, then side margins are
// trimmed. Returns a PNG, or null if the area is blank.
export async function renderQuestion(pages: LoadedPage[], pieces: Piece[]): Promise<Blob | null> {
  const parts: { canvas: HTMLCanvasElement; x: number; y: number; w: number; h: number; rules: Set<number> }[] = [];
  for (const p of pieces) {
    const page = pages[p.page];
    // Stay clear of a ruled line in the gutter between columns.
    const inset = p.x0 > 0 ? Math.round(page.width * 0.006) : 2;
    const insetRight = p.x1 < page.width ? Math.round(page.width * 0.006) : 2;
    const x0 = Math.max(0, Math.round(p.x0) + inset);
    const x1 = Math.min(page.width, Math.round(p.x1) - insetRight);
    const y0 = Math.max(0, Math.round(p.y0));
    const y1 = Math.min(page.height, Math.round(p.y1));
    if (x1 - x0 < 10 || y1 - y0 < 4) continue;
    const data = pagePixels(page);
    const rules = ruleColumns(data, page.width, x0, x1, y0, y1);
    const rows = inkRows(data, page.width, x0, x1, y0, y1, rules);
    if (!rows) continue;
    parts.push({ canvas: page.canvas, x: x0, y: Math.max(y0, rows[0] - 6), w: x1 - x0, h: Math.min(y1, rows[1] + 6) - Math.max(y0, rows[0] - 6), rules });
  }
  if (!parts.length) return null;

  const gap = 12;
  const out = document.createElement("canvas");
  out.width = Math.max(...parts.map((p) => p.w));
  out.height = parts.reduce((s, p) => s + p.h, 0) + gap * (parts.length - 1);
  const octx = out.getContext("2d", { willReadFrequently: true })!;
  octx.fillStyle = "#fff";
  octx.fillRect(0, 0, out.width, out.height);
  let y = 0;
  octx.fillStyle = "#fff";
  for (const p of parts) {
    octx.drawImage(p.canvas, p.x, p.y, p.w, p.h, 0, y, p.w, p.h);
    for (const rx of p.rules) octx.fillRect(rx - p.x, y, 1, p.h); // erase ruled lines
    y += p.h + gap;
  }

  // Trim empty space on the left and right.
  const data = octx.getImageData(0, 0, out.width, out.height).data;
  let left = out.width;
  let right = 0;
  for (let yy = 0; yy < out.height; yy += 2) {
    for (let xx = 0; xx < out.width; xx++) {
      if (dark(data, (yy * out.width + xx) * 4)) {
        if (xx < left) left = xx;
        if (xx > right) right = xx;
      }
    }
  }
  const pad = 8;
  const cx0 = Math.max(0, left - pad);
  const cx1 = Math.min(out.width, right + pad + 1);
  const final = document.createElement("canvas");
  final.width = Math.max(1, cx1 - cx0);
  final.height = out.height;
  const fctx = final.getContext("2d")!;
  fctx.fillStyle = "#fff";
  fctx.fillRect(0, 0, final.width, final.height);
  fctx.drawImage(out, cx0, 0, final.width, out.height, 0, 0, final.width, out.height);
  return new Promise((resolve) => final.toBlob((b) => resolve(b), "image/png"));
}
