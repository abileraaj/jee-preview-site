"use client";

import { useState } from "react";
import type { ProgressEntry } from "@/lib/report";

const COLOURS: Record<string, string> = {
  Total: "#1e3a8a",
  Physics: "#2563eb",
  Chemistry: "#16a34a",
  Mathematics: "#d97706",
};

// Share of marks per test, with a toggle for the total or one subject.
export function ProgressChart({ entries }: { entries: ProgressEntry[] }) {
  const subjects = [...new Set(entries.flatMap((e) => Object.keys(e.subject_scores ?? {})))];
  const views = ["Total", ...subjects];
  const [view, setView] = useState("Total");

  const value = (e: ProgressEntry, v: string) => {
    if (v === "Total") {
      const all = Object.values(e.subject_scores ?? {});
      const max = all.reduce((s, x) => s + Number(x.max), 0);
      return max ? all.reduce((s, x) => s + Number(x.score), 0) / max : null;
    }
    const s = e.subject_scores?.[v];
    return s && Number(s.max) ? Number(s.score) / Number(s.max) : null;
  };

  const W = 760, H = 280, left = 52, right = 24, top = 28, bottom = 40;
  const n = entries.length;
  const x = (i: number) => (n === 1 ? (left + W - right) / 2 : left + (i * (W - left - right)) / (n - 1));
  const vals = entries.map((e) => value(e, view));
  const lo = Math.min(0, ...vals.filter((v): v is number => v !== null).map((v) => Math.floor(v * 10) / 10));
  const y = (v: number) => top + (H - top - bottom) * (1 - (v - lo) / (1 - lo));
  const ticks = [];
  for (let t = lo; t <= 1.0001; t += 0.2) ticks.push(Math.round(t * 100) / 100);
  const pts = vals.map((v, i) => (v === null ? null : [x(i), y(v)] as const));
  const path = pts.filter(Boolean).map((p, i) => `${i ? "L" : "M"}${p![0]},${p![1]}`).join(" ");
  const colour = COLOURS[view] ?? "#7c3aed";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2" role="tablist">
        {views.map((v) => (
          <button key={v} type="button" role="tab" aria-selected={v === view} onClick={() => setView(v)}
            className={`rounded-full px-3 py-1 text-sm font-semibold ${v === view ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
            {v}
          </button>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${view}: share of marks in each test`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={W - right} y1={y(t)} y2={y(t)} stroke={t === 0 ? "#94a3b8" : "#e2e8f0"} />
            <text x={left - 6} y={y(t) + 4} textAnchor="end" fontSize="13" fill="#64748b">{Math.round(t * 100)}%</text>
          </g>
        ))}
        <path d={path} fill="none" stroke={colour} strokeWidth="2.5" />
        {entries.map((e, i) => {
          const p = pts[i];
          return (
            <g key={e.attempt_id}>
              {p && (
                <>
                  <circle cx={p[0]} cy={p[1]} r="4.5" fill={colour} />
                  <text x={p[0]} y={p[1] - 9} textAnchor="middle" fontSize="14" fontWeight="700" fill="#0f172a">
                    {Math.round(vals[i]! * 100)}%
                  </text>
                </>
              )}
              <text x={x(i)} y={H - 12} textAnchor="middle" fontSize="14" fontWeight="600" fill="#334155">{e.code ?? e.title}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
