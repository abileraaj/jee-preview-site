import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/papers";

export const metadata: Metadata = { title: "Question papers" };

const STATUS_STYLE: Record<string, string> = {
  published: "bg-green-100 text-green-800",
  ready: "bg-blue-100 text-blue-800",
  progress: "bg-amber-100 text-amber-800",
  empty: "bg-slate-100 text-slate-600",
};

export default async function PapersDashboard() {
  const profile = await requireRole(["faculty", "admin"]);
  const supabase = await createClient();
  const [{ data: tests }, { data: progress }] = await Promise.all([
    supabase.from("tests").select("id, code, title, status, scheduled_date").order("scheduled_date").order("code"),
    supabase.from("paper_progress").select("*"),
  ]);
  const byTest = new Map((progress ?? []).map((p) => [p.test_id as string, p]));
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

  const rows = (tests ?? []).map((t) => {
    const p = byTest.get(t.id) ?? { filled: 0, confirmed: 0, rejected: 0, total: 75 };
    let state: keyof typeof STATUS_STYLE = "empty";
    let label = "Not started";
    if (t.status === "published") [state, label] = ["published", "Published"];
    else if (p.total > 0 && p.confirmed === p.total) [state, label] = ["ready", "Ready to publish"];
    else if (p.filled > 0) [state, label] = ["progress", "In progress"];
    const daysLeft = t.scheduled_date
      ? Math.round((Date.parse(t.scheduled_date) - Date.parse(today)) / 86400000)
      : null;
    return { ...t, p, state, label, daysLeft };
  });
  const next = rows.find((r) => r.status !== "published" && (r.daysLeft ?? 0) >= 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Question papers</h1>
          <p className="mt-1 text-slate-600">
            Open a paper to enter its questions. A paper reaches students only after the admin
            confirms every question and publishes it.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {profile.role === "admin" && (
            <Link href="/admin/chapters" className="btn-outline px-3 py-2 text-sm">Chapters</Link>
          )}
          <a href="/faculty/export" className="btn-outline px-3 py-2 text-sm">Export all questions (Excel)</a>
        </div>
      </div>

      {next && (
        <div className="card border-amber-300 bg-amber-50">
          <p className="text-sm text-amber-900">
            Next paper due: <b>{next.code}</b> on {formatDate(next.scheduled_date)}
            {next.daysLeft === 0 ? " (today)" : ` (in ${next.daysLeft} day${next.daysLeft === 1 ? "" : "s"})`}.
            {" "}{next.p.filled} of {next.p.total} questions entered, {next.p.confirmed} confirmed.
          </p>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="card text-slate-600">
          No papers yet. Run <code>supabase/seed/0002_schedule.sql</code> in the Supabase SQL Editor
          to create the 33 scheduled papers.
        </div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Paper</th>
                <th className="px-4 py-2 font-medium">Title</th>
                <th className="px-4 py-2 font-medium">Opens on</th>
                <th className="px-4 py-2 font-medium">Entered</th>
                <th className="px-4 py-2 font-medium">Confirmed</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2 font-semibold text-slate-900">{r.code}</td>
                  <td className="px-4 py-2 text-slate-700">{r.title}</td>
                  <td className="px-4 py-2 text-slate-600">{formatDate(r.scheduled_date)}</td>
                  <td className="px-4 py-2 text-slate-600">{r.p.filled} / {r.p.total}</td>
                  <td className="px-4 py-2 text-slate-600">
                    {r.p.confirmed} / {r.p.total}
                    {r.p.rejected > 0 && <span className="ml-1 text-red-600">({r.p.rejected} to fix)</span>}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[r.state]}`}>
                      {r.label}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link href={`/faculty/papers/${r.id}`} className="font-medium text-brand-700 hover:underline">
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
