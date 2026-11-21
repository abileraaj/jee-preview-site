import type { Metadata } from "next";
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/papers";
import { nowMs } from "@/lib/time";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const profile = await requireProfile();
  const firstName = (profile.full_name ?? "").split(" ")[0] || "there";
  const supabase = await createClient();
  await supabase.rpc("finish_my_expired");

  const [{ data: tests }, { data: attempts }] = await Promise.all([
    supabase.from("tests").select("id, code, title, scheduled_date, starts_at, ends_at, duration_min")
      .eq("status", "published").order("scheduled_date"),
    supabase.from("attempts").select("id, test_id, status, score, percentile, rank, submitted_at, is_trial")
      .eq("user_id", profile.id),
  ]);
  const byTest = new Map((attempts ?? []).map((a) => [a.test_id as string, a]));
  const now = nowMs();
  const open = (tests ?? []).filter((t) => (!t.starts_at || Date.parse(t.starts_at) <= now) && (!t.ends_at || Date.parse(t.ends_at) >= now));
  const upcoming = (tests ?? []).filter((t) => t.starts_at && Date.parse(t.starts_at) > now).slice(0, 5);
  const done = (attempts ?? []).filter((a) => a.submitted_at);
  const best = done.reduce<number | null>((m, a) => (a.percentile === null ? m : Math.max(m ?? 0, Number(a.percentile))), null);
  const last = [...done].sort((a, b) => Date.parse(b.submitted_at!) - Date.parse(a.submitted_at!))[0];
  const staff = profile.role !== "student";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Hi {firstName}</h1>
        <p className="mt-1 text-slate-600">Your tests, reports and progress.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card">
          <p className="text-sm text-slate-500">Tests taken</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{done.length}</p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-500">Best percentile</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{best === null ? "–" : best.toFixed(2)}</p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-500">Last score</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{last ? Number(last.score) : "–"}</p>
          {done.length > 0 && <Link href="/progress" className="text-sm font-medium text-brand-700 hover:underline">See progress →</Link>}
        </div>
      </div>

      {staff && (
        <p className="card border-amber-300 bg-amber-50 text-sm text-amber-900">
          Staff: to try a paper as a student before its date, open it from <Link href="/faculty" className="font-semibold underline">Question papers</Link> and press <b>Try as student</b>.
        </p>
      )}

      <section className="card space-y-3">
        <h2 className="font-semibold text-slate-900">Open now</h2>
        {open.length === 0 ? (
          <p className="text-slate-600">No test is open right now.{upcoming[0] && ` The next one, ${upcoming[0].code}, opens on ${formatDate(upcoming[0].scheduled_date)}.`}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {open.map((t) => {
              const a = byTest.get(t.id);
              return (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-semibold text-slate-900">{t.code}: {t.title}</p>
                    <p className="text-sm text-slate-500">{formatDate(t.scheduled_date)} · {t.duration_min} minutes</p>
                  </div>
                  {a?.submitted_at ? (
                    <Link href={`/results/${a.id}`} className="btn-outline px-3 py-2 text-sm">
                      Report · {Number(a.score)} marks
                    </Link>
                  ) : a ? (
                    <Link href={`/exam/${a.id}`} className="btn px-3 py-2 text-sm">Resume</Link>
                  ) : (
                    <Link href={`/tests/${t.id}`} className="btn px-3 py-2 text-sm">Start</Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {upcoming.length > 0 && (
        <section className="card space-y-3">
          <h2 className="font-semibold text-slate-900">Coming up</h2>
          <ul className="divide-y divide-slate-100">
            {upcoming.map((t) => (
              <li key={t.id} className="flex justify-between gap-3 py-2 text-sm">
                <span className="font-medium text-slate-900">{t.code}: {t.title}</span>
                <span className="text-slate-600">{formatDate(t.scheduled_date)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
