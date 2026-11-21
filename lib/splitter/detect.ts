// Pure logic for splitting a question paper into questions. No browser
// APIs here, so it can be tested on its own. All positions are in the
// pixels of the rendered page image, with y growing downwards.

export type TextItem = { x: number; y: number; w: number; h: number; text: string };

export type PageData = {
  width: number;
  height: number;
  items: TextItem[];
  source: "text" | "ocr" | "none";
};

export type Settings = {
  columns: 1 | 2;
  split: number; // where two columns divide, as a fraction of page width
  marginTop: number; // fraction of page height ignored at the top of every page
  marginBottom: number; // fraction ignored at the bottom
  excluded: number[]; // page indexes left out (cover page, instructions, answer key)
};

export type Cut = { id: string; page: number; col: number; y: number; auto: boolean; num?: number };

export type Piece = { page: number; x0: number; x1: number; y0: number; y1: number };

export type Line = { x: number; y: number; h: number; text: string };

// Where a two-column page divides: the point in the middle band of the
// page that the fewest text items cross.
export function columnSplit(page: PageData): number {
  const w = page.width;
  const lo = Math.round(w * 0.35);
  const hi = Math.round(w * 0.65);
  const bins = 120;
  const step = (hi - lo) / bins;
  const cover = new Array(bins).fill(0);
  for (const it of page.items) {
    const a = Math.max(0, Math.floor((it.x - lo) / step));
    const b = Math.min(bins - 1, Math.floor((it.x + it.w - lo) / step));
    for (let i = a; i <= b; i++) cover[i]++;
  }
  // Prefer the empty band closest to the centre.
  let best = Math.floor(bins / 2);
  for (let i = 0; i < bins; i++) {
    const d = Math.abs(i - bins / 2);
    if (cover[i] < cover[best] || (cover[i] === cover[best] && d < Math.abs(best - bins / 2))) best = i;
  }
  return Math.round(lo + (best + 0.5) * step);
}

export function guessColumns(pages: PageData[]): 1 | 2 {
  // Two columns when a good share of the text starts right of the gutter
  // and almost nothing runs across it.
  let left = 0;
  let right = 0;
  let across = 0;
  for (const p of pages) {
    if (p.items.length < 10) continue;
    const split = columnSplit(p);
    for (const it of p.items) {
      if (it.x >= split) right++;
      else if (it.x + it.w <= split + 2) left++;
      else across++;
    }
  }
  const total = left + right + across;
  return total > 0 && right > 0.2 * total && across < 0.1 * total ? 2 : 1;
}

// One divider position for the whole paper: the median over pages that
// have text on both sides, so a half-empty last page is not misjudged.
export function paperSplit(pages: PageData[]): number {
  const fractions: number[] = [];
  for (const p of pages) {
    if (p.items.length < 10) continue;
    const f = columnSplit(p) / p.width;
    const rightItems = p.items.filter((it) => it.x >= f * p.width).length;
    if (rightItems >= 5 && rightItems <= p.items.length - 5) fractions.push(f);
  }
  if (!fractions.length) return 0.5;
  fractions.sort((a, b) => a - b);
  return fractions[Math.floor(fractions.length / 2)];
}

export function columnBounds(page: PageData, settings: Pick<Settings, "columns" | "split">): [number, number][] {
  if (settings.columns === 1) return [[0, page.width]];
  const s = Math.round(page.width * settings.split);
  return [[0, s], [s, page.width]];
}

// Joins text items that sit on the same baseline into lines.
export function groupLines(items: TextItem[]): Line[] {
  const sorted = items
    .filter((i) => i.text.trim() !== "" && i.h > 0)
    .sort((a, b) => a.y + a.h - (b.y + b.h));
  const lines: TextItem[][] = [];
  for (const it of sorted) {
    const base = it.y + it.h;
    const last = lines.at(-1);
    if (last) {
      const ref = last[0];
      const refBase = ref.y + ref.h;
      if (Math.abs(base - refBase) < 0.5 * Math.min(ref.h, it.h)) {
        last.push(it);
        continue;
      }
    }
    lines.push([it]);
  }
  return lines.map((group) => {
    group.sort((a, b) => a.x - b.x);
    let text = "";
    let prevEnd = -Infinity;
    for (const g of group) {
      if (text && g.x - prevEnd > g.h * 0.25 && !text.endsWith(" ")) text += " ";
      text += g.text;
      prevEnd = g.x + g.w;
    }
    return {
      x: group[0].x,
      y: Math.min(...group.map((g) => g.y)),
      h: Math.max(...group.map((g) => g.h)),
      text,
    };
  });
}

// "1.", "12)", "Q5", "Q.5", "Question 5", "Q No. 5" at the start of a line.
// Not "(1)" (that is how NTA papers number options) and not "1.5".
const WITH_Q = /^\s*Q(?:ues(?:tion)?)?\s*\.?\s*(?:No\.?\s*)?(\d{1,3})\b/i;
const PLAIN = /^\s*(\d{1,3})\s*(?:\.(?!\d)|\)|:)/;

export function questionNumber(text: string): number | null {
  const m = WITH_Q.exec(text) ?? PLAIN.exec(text);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 200 ? n : null;
}

type Candidate = { page: number; col: number; y: number; h: number; num: number };

// Finds where each question starts. Question numbers sit at the left edge
// of their column; among all such numbers, the longest run that counts up
// (1, 2, 3 ... with restarts at 1 for a new subject or section) is taken
// as the questions, which filters out option numbers and stray digits.
// When the paper's question count is known, numbered lists before or after
// the questions (cover-page instructions, answer keys) are dropped.
export function detectCuts(pages: PageData[], settings: Settings, expected?: number): Cut[] {
  const cands: Candidate[] = [];
  pages.forEach((page, pi) => {
    if (settings.excluded.includes(pi)) return;
    const top = page.height * settings.marginTop;
    const bottom = page.height * (1 - settings.marginBottom);
    columnBounds(page, settings).forEach(([x0, x1], ci) => {
      const lines = groupLines(
        page.items.filter((it) => it.x >= x0 - 2 && it.x < x1 - 2 && it.y >= top && it.y + it.h <= bottom),
      );
      if (!lines.length) return;
      const xs = lines.map((l) => l.x).sort((a, b) => a - b);
      const leftEdge = xs[Math.floor(xs.length * 0.05)];
      const tolerance = page.width * 0.035;
      for (const l of lines) {
        if (l.x > leftEdge + tolerance) continue;
        const num = questionNumber(l.text);
        if (num !== null) cands.push({ page: pi, col: ci, y: l.y, h: l.h, num });
      }
    });
  });
  cands.sort((a, b) => a.page - b.page || a.col - b.col || a.y - b.y);

  // Longest counting chain (dynamic programming).
  const n = cands.length;
  const score = new Array<number>(n).fill(0);
  const prev = new Array<number>(n).fill(-1);
  for (let i = 0; i < n; i++) {
    score[i] = cands[i].num === 1 ? 1.1 : 1;
    for (let j = 0; j < i; j++) {
      const a = cands[j].num;
      const b = cands[i].num;
      let gain = 0;
      if (b === a + 1) gain = 1;
      else if (b === 1 && a >= 2) gain = 0.9; // numbering restarts for a new subject or section
      else if (b === a + 2) gain = 0.4; // one question number was not readable
      if (gain && score[j] + gain > score[i]) {
        score[i] = score[j] + gain;
        prev[i] = j;
      }
    }
  }
  let end = -1;
  for (let i = 0; i < n; i++) if (end < 0 || score[i] > score[end]) end = i;
  let chain: Candidate[] = [];
  for (let i = end; i >= 0; i = prev[i]) chain.unshift(cands[i]);

  if (expected && chain.length > expected) {
    // Split into runs at each restart, then drop whole runs from the start
    // and the end while enough questions remain.
    const runs: Candidate[][] = [];
    for (const c of chain) {
      if (!runs.length || c.num === 1) runs.push([c]);
      else runs.at(-1)!.push(c);
    }
    let total = chain.length;
    while (runs.length > 1 && total - runs[0].length >= expected && runs[0].length < expected) {
      total -= runs.shift()!.length;
    }
    while (runs.length > 1 && total - runs.at(-1)!.length >= expected && runs.at(-1)!.length < expected) {
      total -= runs.pop()!.length;
    }
    chain = runs.flat();
  }

  return chain.map((c, k) => ({
    id: `a${k}`,
    page: c.page,
    col: c.col,
    y: Math.max(0, Math.round(c.y - c.h * 0.45)),
    auto: true,
    num: c.num,
  }));
}

// Headers and footers printed on every page (paper title, page numbers,
// "space for rough work") sit at the same height on most pages. Returns
// margins that leave them out.
export function detectMargins(pages: PageData[]): { marginTop: number; marginBottom: number } {
  const textPages = pages.filter((p) => p.items.length > 10);
  let marginTop = 0.02;
  let marginBottom = 0.02;
  if (textPages.length < 2) return { marginTop: 0.03, marginBottom: 0.04 };
  const key = (t: string) => t.toLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ").trim();
  const seen = new Map<string, number>();
  for (const p of textPages) {
    const keys = new Set<string>();
    for (const l of groupLines(p.items)) {
      const fTop = l.y / p.height;
      const fBottom = (l.y + l.h) / p.height;
      if (fBottom < 0.15) keys.add(`t|${Math.round(fTop * 200)}|${key(l.text)}`);
      else if (fTop > 0.85) keys.add(`b|${Math.round(fTop * 200)}|${key(l.text)}`);
    }
    for (const k of keys) seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  const need = Math.max(2, Math.ceil(textPages.length * 0.6));
  for (const p of textPages) {
    for (const l of groupLines(p.items)) {
      const fTop = l.y / p.height;
      const fBottom = (l.y + l.h) / p.height;
      if (fBottom < 0.15 && (seen.get(`t|${Math.round(fTop * 200)}|${key(l.text)}`) ?? 0) >= need) {
        marginTop = Math.max(marginTop, fBottom + 0.012);
      } else if (fTop > 0.85 && (seen.get(`b|${Math.round(fTop * 200)}|${key(l.text)}`) ?? 0) >= need) {
        marginBottom = Math.max(marginBottom, 1 - fTop + 0.008);
      }
    }
  }
  return { marginTop: Math.min(0.2, marginTop), marginBottom: Math.min(0.2, marginBottom) };
}

// Settings and cut lines for a freshly loaded paper: layout, header and
// footer margins, and pages left out because they come before the first
// question or after the last one (cover, instructions, answer key).
export function autoSettings(pages: PageData[], expected?: number): { settings: Settings; cuts: Cut[] } {
  const settings: Settings = { columns: guessColumns(pages), split: paperSplit(pages), ...detectMargins(pages), excluded: [] };
  let cuts = detectCuts(pages, settings, expected);
  if (cuts.length) {
    const first = cuts[0].page;
    const last = cuts.at(-1)!.page;
    settings.excluded = pages.map((_, i) => i).filter((i) => i < first || i > last);
    cuts = detectCuts(pages, settings, expected);
  }
  return { settings, cuts };
}

const HEADING = /^\s*(?:physics|chemistry|mathematics|maths|section|part)\b[\s\-–:A-Za-z0-9().]*$/i;

// Subject and section headings ("CHEMISTRY", "SECTION - B") between
// questions: left out of the question pictures.
function headingZones(page: PageData, pi: number, settings: Settings) {
  const zones: { col: number; y0: number; y1: number }[] = [];
  columnBounds(page, settings).forEach(([x0, x1], ci) => {
    const lines = groupLines(page.items.filter((it) => it.x >= x0 - 2 && it.x < x1 - 2));
    for (const l of lines) {
      if (l.text.length <= 40 && HEADING.test(l.text)) {
        zones.push({ col: ci, y0: l.y - l.h * 0.35, y1: l.y + l.h * 1.35 });
      }
    }
  });
  void pi;
  return zones;
}

// Turns the cut lines into questions: each question is one or more
// rectangles in reading order (left column, then right column, then the
// next page). Anything above the very first cut is the paper's heading
// and is dropped.
export function buildQuestions(pages: PageData[], cuts: Cut[], settings: Settings): { pieces: Piece[]; cutId: string }[] {
  const questions: { pieces: Piece[]; cutId: string }[] = [];
  pages.forEach((page, pi) => {
    if (settings.excluded.includes(pi)) return;
    const top = Math.round(page.height * settings.marginTop);
    const bottom = Math.round(page.height * (1 - settings.marginBottom));
    const zones = headingZones(page, pi, settings);
    columnBounds(page, settings).forEach(([x0, x1], ci) => {
      const colZones = zones.filter((z) => z.col === ci).sort((a, b) => a.y0 - b.y0);
      // Adds the band y0..y1 to the current question, minus any headings.
      const add = (y0: number, y1: number) => {
        const current = questions.at(-1);
        if (!current) return;
        let from = y0;
        for (const z of colZones) {
          if (z.y1 <= from || z.y0 >= y1) continue;
          if (z.y0 - from > 4) current.pieces.push({ page: pi, x0, x1, y0: from, y1: z.y0 });
          from = Math.max(from, z.y1);
        }
        if (y1 - from > 4) current.pieces.push({ page: pi, x0, x1, y0: from, y1 });
      };
      const here = cuts
        .filter((c) => c.page === pi && c.col === ci && c.y >= top && c.y < bottom)
        .sort((a, b) => a.y - b.y);
      let y = top;
      for (const c of here) {
        add(y, c.y);
        questions.push({ pieces: [], cutId: c.id });
        y = c.y;
      }
      add(y, bottom);
    });
  });
  return questions.filter((q) => q.pieces.length > 0);
}

// "1-B, 2 C, 3.(4), 21: 4.5" -> {1: "B", 2: "C", 3: "4", 21: "4.5"}
export function parseAnswerKey(text: string): Map<number, string> {
  const out = new Map<number, string>();
  const re = /(\d{1,3})\s*[.\-:)=\s]\s*\(?\s*([A-Da-d]|-?\d+(?:\.\d+)?)\s*\)?/g;
  for (const m of text.matchAll(re)) out.set(Number(m[1]), m[2].toUpperCase());
  return out;
}

// For a multiple-choice question, "1".."4" mean options A..D (NTA style).
export function toOption(value: string): "A" | "B" | "C" | "D" | null {
  const v = value.trim().toUpperCase();
  if (["A", "B", "C", "D"].includes(v)) return v as "A" | "B" | "C" | "D";
  const i = ["1", "2", "3", "4"].indexOf(v);
  return i >= 0 ? (["A", "B", "C", "D"] as const)[i] : null;
}
