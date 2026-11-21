/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { formatDuration } from "@/lib/exam";
import { answerText, chapterRows, strongWeak, subjectRows, timeFlags, type Report } from "@/lib/report";
import { PrintButton } from "@/components/report/print-button";
import { TimeChart } from "@/components/report/time-chart";

const pct = (v: number | null) => (v === null ? "–" : `${Math.round(v * 100)}%`);
const VERDICT = {
  strong: { text: "Strong", cls: "bg-green-100 text-green-800" },
  weak: { text: "Revise", cls: "bg-red-100 text-red-800" },
  skipped: { text: "Not attempted", cls: "bg-slate-100 text-slate-600" },
  ok: { text: "Average", cls: "bg-amber-100 text-amber-900" },
};

export function ReportView({
  r, imageUrls, ownTrial, deleteTrial,
}: {
  r: Report;
  imageUrls: Record<string, string>;
  ownTrial: boolean;
  deleteTrial?: () => Promise<void>;
}) {
  const a = r.attempt;
  const subjects = subjectRows(r);
  const { strongest, weakest } = strongWeak(subjects);
  const chapters = chapterRows(r);
  const flags = timeFlags(r);
  const totalTime = subjects.reduce((s, x) => s + x.timeMs, 0);
  const attempted = a.correct + a.wrong;
  const accuracy = attempted ? a.correct / attempted : null;
  const maxMarks = subjects.reduce((s, x) => s + x.max, 0);
  const revise = chapters.filter((c) => c.verdict === "weak" && c.chapter !== "No chapter set");
  const strong = chapters.filter((c) => c.verdict === "strong" && c.chapter !== "No chapter set");
  const hasChapters = chapters.some((c) => c.chapter !== "No chapter set");

  return (
    <div className="space-y-6 print:space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/dashboard" className="text-sm font-medium text-brand-700 hover:underline print:hidden">← Dashboard</Link>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Performance report: {r.test.code}</h1>
          <p className="text-slate-600">
            {r.test.title} · {r.student?.name ?? ""} · submitted{" "}
            {new Date(a.submitted_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })}
            {a.status === "auto_submitted" && " (time ran out)"}
          </p>
          {a.is_trial && <p className="mt-1 text-sm font-medium text-amber-800">Staff trial: not counted in students&apos; ranks.</p>}
        </div>
        <div className="flex gap-2 print:hidden">
          <PrintButton />
          <Link href="/progress" className="btn-outline px-3 py-2 text-sm">My progress</Link>
        </div>
      </div>

      {/* Headline numbers */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card border-brand-500 bg-brand-50">
          <p className="text-sm text-slate-600">Score</p>
          <p className="text-3xl font-bold text-slate-900">{Number(a.score)} <span className="text-lg font-medium text-slate-500">/ {maxMarks}</span></p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-600">Percentile</p>
          <p className="text-3xl font-bold text-slate-900">{a.percentile === null ? "–" : Number(a.percentile).toFixed(2)}</p>
          <p className="text-xs text-slate-500">Among {r.takers} test-taker{r.takers === 1 ? "" : "s"} so far; updates as more students finish</p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-600">Rank</p>
          <p className="text-3xl font-bold text-slate-900">{a.rank ?? "–"} <span className="text-lg font-medium text-slate-500">of {r.takers}</span></p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-600">Time used</p>
          <p className="text-3xl font-bold text-slate-900">{formatDuration(totalTime)}</p>
          <p className="text-xs text-slate-500">of {r.test.duration_min} minutes</p>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-5">
        {[
          ["Correct", a.correct, "text-green-700"],
          ["Wrong", a.wrong, "text-red-700"],
          ["Not answered", a.unattempted, "text-slate-700"],
          ["Accuracy", pct(accuracy), "text-slate-900"],
          ["Marks lost to wrong answers", `−${Number(a.negative_marks)}`, "text-red-700"],
        ].map(([label, value, cls]) => (
          <div key={label as string} className="card py-3">
            <p className="text-xs text-slate-600">{label}</p>
            <p className={`text-xl font-bold ${cls}`}>{value}</p>
          </div>
        ))}
      </section>

      {/* Subjects */}
      <section className="card space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Subject-wise performance</h2>
        {strongest && weakest && (
          <div className="grid gap-3 sm:grid-cols-2">
            <p className="rounded-lg bg-green-50 px-3 py-2 text-green-900">
              <b>Strongest: {strongest.name}</b>, {strongest.score} of {strongest.max} ({pct(strongest.pct)})
            </p>
            <p className="rounded-lg bg-red-50 px-3 py-2 text-red-900">
              <b>Needs work: {weakest.name}</b>, {weakest.score} of {weakest.max} ({pct(weakest.pct)})
            </p>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="border-b border-slate-200 text-slate-500">
              <tr>
                {["Subject", "Score", "Correct", "Wrong", "Not answered", "Accuracy", "Time spent", "Per question", "Percentile"].map((h) => (
                  <th key={h} className="py-2 pr-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {subjects.map((s) => (
                <tr key={s.name}>
                  <td className="py-2 pr-3 font-semibold text-slate-900">{s.name}</td>
                  <td className="py-2 pr-3">{s.score} / {s.max}</td>
                  <td className="py-2 pr-3 text-green-700">{s.correct}</td>
                  <td className="py-2 pr-3 text-red-700">{s.wrong}</td>
                  <td className="py-2 pr-3">{s.unattempted}</td>
                  <td className="py-2 pr-3">{pct(s.accuracy)}</td>
                  <td className="py-2 pr-3">{formatDuration(s.timeMs)}</td>
                  <td className="py-2 pr-3">{formatDuration(s.timeMs / Math.max(1, s.correct + s.wrong + s.unattempted))}</td>
                  <td className="py-2 pr-3">{s.percentile === null ? "–" : s.percentile.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Time */}
      <section className="card space-y-4 break-inside-avoid">
        <h2 className="text-lg font-semibold text-slate-900">Time on each question</h2>
        <TimeChart questions={r.questions} />
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg bg-slate-50 p-3 text-sm">
            <p className="font-semibold text-slate-900">Took longest</p>
            <ul className="mt-1 space-y-0.5 text-slate-700">
              {flags.longest.map((q) => (
                <li key={q.position}>Q{q.position} ({q.subject}): {formatDuration(q.time_spent_ms)}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg bg-red-50 p-3 text-sm">
            <p className="font-semibold text-red-900">Slow and still wrong</p>
            <p className="text-xs text-red-800">Over {formatDuration(Math.max(120_000, 2 * flags.averageMs))}. Skip such questions sooner.</p>
            <p className="mt-1 text-red-900">{flags.slowWrong.length ? flags.slowWrong.map((q) => `Q${q.position}`).join(", ") : "None"}</p>
          </div>
          <div className="rounded-lg bg-amber-50 p-3 text-sm">
            <p className="font-semibold text-amber-900">Possibly careless</p>
            <p className="text-xs text-amber-800">Wrong in under 30 seconds. Read the question again before answering.</p>
            <p className="mt-1 text-amber-900">{flags.careless.length ? flags.careless.map((q) => `Q${q.position}`).join(", ") : "None"}</p>
          </div>
        </div>
      </section>

      {/* Chapters */}
      <section className="card space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Chapter-wise strengths and weaknesses</h2>
        {!hasChapters ? (
          <p className="text-sm text-slate-600">Chapters were not set for this paper&apos;s questions, so there is no chapter analysis.</p>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg bg-red-50 p-3 text-sm">
                <p className="font-semibold text-red-900">Revise these chapters</p>
                <p className="mt-1 text-red-900">{revise.length ? revise.map((c) => `${c.chapter} (${c.subject})`).join(", ") : "None. Well done."}</p>
              </div>
              <div className="rounded-lg bg-green-50 p-3 text-sm">
                <p className="font-semibold text-green-900">Strong chapters</p>
                <p className="mt-1 text-green-900">{strong.length ? strong.map((c) => `${c.chapter} (${c.subject})`).join(", ") : "None yet."}</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-slate-200 text-slate-500">
                  <tr>
                    {["Subject", "Chapter", "Questions", "Correct", "Wrong", "Not answered", "Accuracy", "Marks", "Time", ""].map((h) => (
                      <th key={h} className="py-2 pr-3 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {chapters.map((c) => (
                    <tr key={`${c.subject}-${c.chapter}`}>
                      <td className="py-2 pr-3 text-slate-600">{c.subject}</td>
                      <td className="py-2 pr-3 font-medium text-slate-900">{c.chapter}</td>
                      <td className="py-2 pr-3">{c.total}</td>
                      <td className="py-2 pr-3 text-green-700">{c.correct}</td>
                      <td className="py-2 pr-3 text-red-700">{c.wrong}</td>
                      <td className="py-2 pr-3">{c.unattempted}</td>
                      <td className="py-2 pr-3">{pct(c.accuracy)}</td>
                      <td className="py-2 pr-3">{c.marks} / {c.max}</td>
                      <td className="py-2 pr-3">{formatDuration(c.timeMs)}</td>
                      <td className="py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${VERDICT[c.verdict].cls}`}>{VERDICT[c.verdict].text}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* Every question */}
      <section className="card space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Every question: your answer, time and solution</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-slate-200 text-slate-500">
              <tr>
                {["Q", "Subject", "Chapter", "Your answer", "Correct", "Result", "Marks", "Your time", "Average", "Topper", "Got it right"].map((h) => (
                  <th key={h} className="py-2 pr-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {r.questions.map((q) => (
                <tr key={q.position} className={q.is_correct === true ? "bg-green-50/50" : q.is_correct === false ? "bg-red-50/50" : ""}>
                  <td className="py-1.5 pr-3 font-semibold"><a href={`#sol-${q.position}`} className="hover:underline print:no-underline">{q.position}</a></td>
                  <td className="py-1.5 pr-3">{q.subject}</td>
                  <td className="py-1.5 pr-3 text-slate-600">{q.chapter ?? ""}</td>
                  <td className="py-1.5 pr-3">{answerText(q, "yours")}</td>
                  <td className="py-1.5 pr-3 font-medium">{answerText(q, "correct")}</td>
                  <td className={`py-1.5 pr-3 font-medium ${q.is_correct === true ? "text-green-700" : q.is_correct === false ? "text-red-700" : "text-slate-500"}`}>
                    {q.is_correct === true ? "Correct" : q.is_correct === false ? "Wrong" : "Skipped"}
                  </td>
                  <td className="py-1.5 pr-3">{Number(q.marks ?? 0)}</td>
                  <td className="py-1.5 pr-3">{formatDuration(q.time_spent_ms)}{q.visit_count > 1 && <span className="text-slate-400"> ({q.visit_count} visits)</span>}</td>
                  <td className="py-1.5 pr-3 text-slate-600">{q.avg_time_ms === null ? "–" : formatDuration(q.avg_time_ms)}</td>
                  <td className="py-1.5 pr-3 text-slate-600">{q.topper_time_ms === null ? "–" : formatDuration(q.topper_time_ms)}</td>
                  <td className="py-1.5 pr-3 text-slate-600">{q.correct_percent === null ? "–" : `${Math.round(Number(q.correct_percent))}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3 print:hidden">
        <h2 className="text-lg font-semibold text-slate-900">Solutions</h2>
        {r.questions.map((q) => (
          <details key={q.position} id={`sol-${q.position}`} className="card scroll-mt-4">
            <summary className="cursor-pointer list-none">
              <span className="font-semibold text-slate-900">Q{q.position}</span>{" "}
              <span className="text-sm text-slate-500">{q.subject}{q.chapter ? ` · ${q.chapter}` : ""}</span>{" "}
              <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${q.is_correct === true ? "bg-green-100 text-green-800" : q.is_correct === false ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-600"}`}>
                {q.is_correct === true ? "Correct" : q.is_correct === false ? "Wrong" : "Skipped"}
              </span>
              <span className="ml-2 text-sm text-slate-600">Yours: {answerText(q, "yours")} · Correct: {answerText(q, "correct")}</span>
            </summary>
            <div className="mt-3 space-y-3">
              {q.body && <p className="whitespace-pre-wrap text-slate-900">{q.body}</p>}
              {q.image_path && imageUrls[q.image_path] && <img src={imageUrls[q.image_path]} alt={`Question ${q.position}`} loading="lazy" className="max-w-full" />}
              {q.type === "mcq" && q.options.some((o) => o.body || o.image_path) && (
                <ul className="space-y-1">
                  {q.options.map((o) => (
                    <li key={o.label} className={`rounded px-2 py-1 ${o.label === q.correct_option ? "bg-green-100" : o.label === q.selected_option ? "bg-red-100" : ""}`}>
                      <b>({o.label})</b> {o.body}
                      {o.image_path && imageUrls[o.image_path] && <img src={imageUrls[o.image_path]} alt={`Option ${o.label}`} loading="lazy" className="mt-1 max-h-40" />}
                    </li>
                  ))}
                </ul>
              )}
              <div className="rounded-lg bg-slate-50 p-3 text-sm">
                <p className="font-semibold text-slate-900">Solution</p>
                <p className="mt-1 whitespace-pre-wrap text-slate-700">{q.solution ?? "No written solution for this question yet."}</p>
              </div>
            </div>
          </details>
        ))}
      </section>

      {ownTrial && deleteTrial && (
        <form action={deleteTrial} className="card flex flex-wrap items-center justify-between gap-3 border-amber-300 bg-amber-50 print:hidden">
          <p className="text-sm text-amber-900">Staff trial. Delete it to take this paper again.</p>
          <button className="btn-outline border-amber-400 text-amber-900">Delete this trial attempt</button>
        </form>
      )}
    </div>
  );
}
