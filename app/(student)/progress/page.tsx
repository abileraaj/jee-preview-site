import type { Metadata } from "next";
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { findDrops, type ProgressEntry } from "@/lib/report";
import { ProgressChart } from "@/components/report/progress-chart";

export const metadata: Metadata = { title: "My progress" };

const pct = (v: number) => `${Math.round(v * 100)}%`;

export default async function ProgressPage() {
  await requireProfile();
  const supabase = await createClient();
  await supabase.rpc("finish_my_expired");
  const { data } = await supabase.rpc("get_my_progress");
  const entries = ((data ?? []) as ProgressEntry[]);
  const subjects = [...new Set(entries.flatMap((e) => Object.keys(e.subject_scores ?? {})))];
  const drops = findDrops(entries);

  const subjectScore = (e: ProgressEntry, s: string) => {
    const v = e.subject_scores?.[s];
    return v ? Number(v.score) : null;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">My progress</h1>
        <p className="mt-1 text-slate-600">How your scores move from test to test, overall and in each subject.</p>
      </div>

      {entries.length === 0 ? (
        <p className="card text-slate-600">Finish your first test to see your progress here.</p>
      ) : (
        <>
          {drops.length > 0 && (
            <section className="space-y-3">
              {drops.map((d) => (
                <div key={d.subject} className="card border-red-300 bg-red-50">
                  <p className="font-semibold text-red-900">
                    {d.subject} dropped in {d.test}: {pct(d.now)} of the marks, against your earlier average of {pct(d.before)}.
                  </p>
                  {d.chapters.length > 0 ? (
                    <ul className="mt-1 list-disc pl-5 text-sm text-red-900">
                      {d.chapters.map((c) => (
                        <li key={c.chapter}>
                          <b>{c.chapter}</b>: you were getting {pct(c.before)} right before, {pct(c.now)} in {d.test}. Revise it.
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-sm text-red-900">Open the {d.test} report to see which chapters went wrong.</p>
                  )}
                </div>
              ))}
            </section>
          )}

          <section className="card">
            <h2 className="mb-3 font-semibold text-slate-900">Share of marks in each test</h2>
            <ProgressChart entries={entries} />
          </section>

          <section className="card overflow-x-auto p-0">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Test</th>
                  <th className="px-4 py-2 font-medium">Score</th>
                  <th className="px-4 py-2 font-medium">Percentile</th>
                  {subjects.map((s) => <th key={s} className="px-4 py-2 font-medium">{s}</th>)}
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entries.map((e, i) => {
                  const prev = entries[i - 1];
                  return (
                    <tr key={e.attempt_id}>
                      <td className="px-4 py-2 font-semibold text-slate-900">{e.code}{e.is_trial && <span className="ml-1 text-xs font-normal text-amber-700">(trial)</span>}</td>
                      <td className="px-4 py-2">{Number(e.score)}</td>
                      <td className="px-4 py-2">{e.percentile === null ? "–" : Number(e.percentile).toFixed(2)}</td>
                      {subjects.map((s) => {
                        const now = subjectScore(e, s);
                        const before = prev ? subjectScore(prev, s) : null;
                        const diff = now !== null && before !== null ? now - before : null;
                        return (
                          <td key={s} className="px-4 py-2">
                            {now ?? "–"}
                            {diff !== null && diff !== 0 && (
                              <span className={`ml-1 text-xs font-semibold ${diff > 0 ? "text-green-700" : "text-red-700"}`}>
                                {diff > 0 ? `▲${diff}` : `▼${-diff}`}
                              </span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-4 py-2 text-right">
                        <Link href={`/results/${e.attempt_id}`} className="font-medium text-brand-700 hover:underline">Report</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}
