import type { ReportQuestion } from "@/lib/report";

// Time spent on each question, one bar per question, coloured by result.
export function TimeChart({ questions }: { questions: ReportQuestion[] }) {
  const W = 760;
  const H = 220;
  const left = 40;
  const bottom = 30;
  const top = 12;
  const n = questions.length || 1;
  const maxSec = Math.max(60, ...questions.map((q) => q.time_spent_ms / 1000));
  const step = maxSec > 600 ? 300 : maxSec > 240 ? 120 : 60;
  const yMax = Math.ceil(maxSec / step) * step;
  const bw = (W - left - 8) / n;
  const y = (sec: number) => top + (H - top - bottom) * (1 - sec / yMax);
  const ticks = Array.from({ length: yMax / step + 1 }, (_, i) => i * step);
  const subjects: { name: string; from: number; to: number }[] = [];
  questions.forEach((q, i) => {
    const last = subjects.at(-1);
    if (last && last.name === q.subject) last.to = i;
    else subjects.push({ name: q.subject, from: i, to: i });
  });
  const colour = (q: ReportQuestion) =>
    q.is_correct === true ? "#16a34a" : q.is_correct === false ? "#dc2626" : "#cbd5e1";

  return (
    <figure className="space-y-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Time spent on each question">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={W - 8} y1={y(t)} y2={y(t)} stroke="#e2e8f0" />
            <text x={left - 6} y={y(t) + 4} textAnchor="end" fontSize="12" fill="#64748b">
              {t >= 60 ? `${t / 60}m` : `${t}s`}
            </text>
          </g>
        ))}
        {questions.map((q, i) => {
          const sec = q.time_spent_ms / 1000;
          return (
            <rect key={q.position} x={left + i * bw + 0.5} width={Math.max(1, bw - 1)} y={y(sec)} height={Math.max(0, y(0) - y(sec))}
              fill={colour(q)}>
              <title>{`Q${q.position}: ${Math.round(sec)}s (${q.is_correct === true ? "correct" : q.is_correct === false ? "wrong" : "not answered"})`}</title>
            </rect>
          );
        })}
        {subjects.map((s, k) => (
          <g key={s.name}>
            {k > 0 && <line x1={left + s.from * bw} x2={left + s.from * bw} y1={top} y2={H - bottom + 4} stroke="#94a3b8" strokeDasharray="3 3" />}
            <text x={left + ((s.from + s.to + 1) / 2) * bw} y={H - 8} textAnchor="middle" fontSize="13" fontWeight="600" fill="#334155">
              {s.name} (Q{questions[s.from].position}–{questions[s.to].position})
            </text>
          </g>
        ))}
      </svg>
      <figcaption className="flex flex-wrap gap-4 text-xs text-slate-600">
        <span className="flex items-center gap-1"><span className="h-3 w-3 bg-green-600" /> Correct</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 bg-red-600" /> Wrong</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 bg-slate-300" /> Not answered</span>
      </figcaption>
    </figure>
  );
}
