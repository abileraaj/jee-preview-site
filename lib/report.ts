// Turns a finished attempt into the numbers the report card shows.
// Pure functions: no database, no browser.

export type ReportQuestion = {
  position: number;
  question_id: string;
  code: string | null;
  subject: string;
  section: string;
  type: "mcq" | "numerical";
  marks_correct: number;
  marks_wrong: number;
  chapter: string | null;
  topic: string | null;
  body: string;
  image_path: string | null;
  options: { label: string; body: string; image_path: string | null }[];
  correct_option: string | null;
  numeric_value: number | string | null;
  solution: string | null;
  selected_option: string | null;
  numeric_answer: number | string | null;
  palette_state: string;
  is_correct: boolean | null;
  marks: number | string | null;
  time_spent_ms: number;
  visit_count: number;
  avg_time_ms: number | null;
  topper_time_ms: number | null;
  correct_percent: number | string | null;
};

export type SubjectScore = {
  score: number; max: number; correct: number; wrong: number; unattempted: number; time_ms: number; sort?: number;
};

export type Report = {
  attempt: {
    id: string; test_id: string; user_id: string; status: string; is_trial: boolean; started_at: string; submitted_at: string;
    score: number | string; correct: number; wrong: number; unattempted: number; negative_marks: number | string;
    rank: number | null; percentile: number | string | null;
    subject_scores: Record<string, SubjectScore> | null;
    subject_percentiles: Record<string, number | string> | null;
  };
  student: { name: string | null; mobile: string | null } | null;
  test: { id: string; code: string | null; title: string; duration_min: number; scheduled_date: string | null };
  takers: number;
  questions: ReportQuestion[];
};

export type SubjectRow = {
  name: string; score: number; max: number; pct: number; correct: number; wrong: number; unattempted: number;
  accuracy: number | null; timeMs: number; percentile: number | null;
};

export type ChapterRow = {
  subject: string; chapter: string; total: number; correct: number; wrong: number; unattempted: number;
  marks: number; max: number; accuracy: number | null; timeMs: number;
  verdict: "strong" | "weak" | "skipped" | "ok";
};

const num = (v: number | string | null | undefined) => (v === null || v === undefined || v === "" ? 0 : Number(v));

export function subjectRows(r: Report): SubjectRow[] {
  const s = r.attempt.subject_scores ?? {};
  return Object.entries(s)
    .sort((a, b) => num(a[1].sort) - num(b[1].sort))
    .map(([name, v]) => {
      const attempted = v.correct + v.wrong;
      return {
        name, score: num(v.score), max: num(v.max), pct: num(v.max) ? num(v.score) / num(v.max) : 0,
        correct: v.correct, wrong: v.wrong, unattempted: v.unattempted,
        accuracy: attempted ? v.correct / attempted : null, timeMs: num(v.time_ms),
        percentile: r.attempt.subject_percentiles?.[name] !== undefined ? num(r.attempt.subject_percentiles[name]) : null,
      };
    });
}

// Strongest and weakest subject, by share of that subject's marks.
export function strongWeak(rows: SubjectRow[]) {
  if (rows.length < 2) return { strongest: null, weakest: null };
  const sorted = [...rows].sort((a, b) => b.pct - a.pct);
  if (sorted[0].pct === sorted.at(-1)!.pct) return { strongest: null, weakest: null };
  return { strongest: sorted[0], weakest: sorted.at(-1)! };
}

export function chapterRows(r: Report): ChapterRow[] {
  const map = new Map<string, ChapterRow>();
  for (const q of r.questions) {
    const chapter = q.chapter ?? "No chapter set";
    const key = `${q.subject}|${chapter}`;
    const row = map.get(key) ?? {
      subject: q.subject, chapter, total: 0, correct: 0, wrong: 0, unattempted: 0, marks: 0, max: 0,
      accuracy: null, timeMs: 0, verdict: "ok" as const,
    };
    row.total++;
    if (q.is_correct === true) row.correct++;
    else if (q.is_correct === false) row.wrong++;
    else row.unattempted++;
    row.marks += num(q.marks);
    row.max += num(q.marks_correct);
    row.timeMs += q.time_spent_ms;
    map.set(key, row);
  }
  return [...map.values()].map((c) => {
    const attempted = c.correct + c.wrong;
    const accuracy = attempted ? c.correct / attempted : null;
    let verdict: ChapterRow["verdict"] = "ok";
    if (attempted === 0) verdict = "skipped";
    else if (c.marks < 0 || (accuracy !== null && accuracy < 0.4)) verdict = "weak";
    else if (accuracy !== null && accuracy >= 0.7 && c.marks > 0) verdict = "strong";
    return { ...c, accuracy, verdict };
  });
}

// Questions worth a second look: slow and still wrong; wrong very fast
// (often a careless slip); and the ones that took longest.
export function timeFlags(r: Report) {
  const attempted = r.questions.filter((q) => q.is_correct !== null);
  const avg = attempted.length ? attempted.reduce((s, q) => s + q.time_spent_ms, 0) / attempted.length : 0;
  const slowLimit = Math.max(120_000, 2 * avg);
  return {
    averageMs: avg,
    slowWrong: r.questions.filter((q) => q.is_correct === false && q.time_spent_ms > slowLimit),
    careless: r.questions.filter((q) => q.is_correct === false && q.time_spent_ms > 0 && q.time_spent_ms < 30_000),
    longest: [...r.questions].sort((a, b) => b.time_spent_ms - a.time_spent_ms).slice(0, 5).filter((q) => q.time_spent_ms > 0),
  };
}

export function answerText(q: ReportQuestion, which: "yours" | "correct") {
  if (which === "yours") {
    if (q.type === "mcq") return q.selected_option ?? "Not answered";
    return q.numeric_answer === null || q.numeric_answer === undefined ? "Not answered" : String(Number(q.numeric_answer));
  }
  if (q.type === "mcq") return q.correct_option ?? "";
  return q.numeric_value === null || q.numeric_value === undefined ? "" : String(Number(q.numeric_value));
}

// ---------------------------------------------------------------- progress

export type ProgressEntry = {
  attempt_id: string; code: string | null; title: string; scheduled_date: string | null; submitted_at: string;
  score: number | string; rank: number | null; percentile: number | string | null;
  correct: number; wrong: number; unattempted: number; is_trial: boolean;
  subject_scores: Record<string, SubjectScore> | null;
  subject_percentiles: Record<string, number | string> | null;
  chapters: { subject: string; chapter: string; total: number; correct: number; wrong: number; marks: number | string; max: number | string }[];
};

export type Drop = {
  subject: string;
  test: string;
  before: number; // average share of marks in earlier tests (0..1)
  now: number;
  chapters: { chapter: string; before: number; now: number }[];
};

// Where the latest test fell below the student's own earlier level: for
// each subject, the latest share of marks against the average of earlier
// tests, and the chapters that were strong before but went wrong now.
export function findDrops(entries: ProgressEntry[], threshold = 0.1): Drop[] {
  if (entries.length < 2) return [];
  const latest = entries.at(-1)!;
  const earlier = entries.slice(0, -1);
  const drops: Drop[] = [];
  for (const [subject, s] of Object.entries(latest.subject_scores ?? {})) {
    const nowPct = num(s.max) ? num(s.score) / num(s.max) : 0;
    const prev = earlier
      .map((e) => e.subject_scores?.[subject])
      .filter((x): x is SubjectScore => Boolean(x && num(x.max)))
      .map((x) => num(x.score) / num(x.max));
    if (!prev.length) continue;
    const before = prev.reduce((a, b) => a + b, 0) / prev.length;
    if (before - nowPct < threshold) continue;

    const chapterAcc = (list: ProgressEntry[]) => {
      const m = new Map<string, { c: number; a: number }>();
      for (const e of list) {
        for (const ch of e.chapters) {
          if (ch.subject !== subject || ch.chapter === "No chapter set") continue;
          const v = m.get(ch.chapter) ?? { c: 0, a: 0 };
          v.c += ch.correct;
          v.a += ch.correct + ch.wrong;
          m.set(ch.chapter, v);
        }
      }
      return m;
    };
    const was = chapterAcc(earlier);
    const is = chapterAcc([latest]);
    const chapters: Drop["chapters"] = [];
    for (const [chapter, v] of is) {
      const w = was.get(chapter);
      if (!w || !w.a || !v.a) continue;
      const b = w.c / w.a;
      const n = v.c / v.a;
      if (b >= 0.6 && b - n >= 0.25) chapters.push({ chapter, before: b, now: n });
    }
    chapters.sort((a, b) => b.before - b.now - (a.before - a.now));
    drops.push({ subject, test: latest.code ?? latest.title, before, now: nowPct, chapters });
  }
  return drops;
}
