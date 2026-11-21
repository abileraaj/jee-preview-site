import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/papers";
import { nowMs } from "@/lib/time";
import { StartForm } from "./start-form";

export const metadata: Metadata = { title: "Test instructions" };

const LEGEND = [
  ["bg-slate-100 border-slate-300 text-slate-700", "1", "Not visited: you have not opened this question."],
  ["bg-red-500 border-red-600 text-white rounded-b-xl", "2", "Not answered: opened but no answer saved."],
  ["bg-green-600 border-green-700 text-white rounded-t-xl", "3", "Answered: answer saved. It will be evaluated."],
  ["bg-purple-600 border-purple-700 text-white rounded-full", "4", "Marked for review, no answer. Not evaluated."],
  ["bg-purple-600 border-purple-700 text-white rounded-full ring-2 ring-green-500 ring-offset-1", "5", "Answered and marked for review. It will be evaluated."],
];

export default async function TestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireProfile();
  const supabase = await createClient();
  await supabase.rpc("finish_my_expired");
  const { data: test } = await supabase.from("tests").select("*").eq("id", id).maybeSingle();
  if (!test) notFound();
  const { data: attempt } = await supabase
    .from("attempts").select("id, status, is_trial").eq("test_id", id).eq("user_id", profile.id).maybeSingle();
  const { data: sections } = await supabase.from("test_sections").select("question_count, marks_correct, marks_wrong").eq("test_id", id);
  const total = (sections ?? []).reduce((s, x) => s + x.question_count, 0);
  const maxMarks = (sections ?? []).reduce((s, x) => s + x.question_count * Number(x.marks_correct), 0);
  const staff = profile.role !== "student";
  const opensLater = test.starts_at && Date.parse(test.starts_at) > nowMs();

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href="/dashboard" className="text-sm font-medium text-brand-700 hover:underline">← Dashboard</Link>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">{test.code}: {test.title}</h1>
        <p className="mt-1 text-slate-600">
          {formatDate(test.scheduled_date)} · {total} questions · {maxMarks} marks · {test.duration_min} minutes
        </p>
      </div>

      <section className="card space-y-3">
        <h2 className="font-semibold text-slate-900">Instructions</h2>
        <ol className="list-decimal space-y-1.5 pl-5 text-slate-700">
          <li>The test has three subjects: Physics, Chemistry and Mathematics. Use the tabs at the top to move between them.</li>
          <li>Each subject has Section A (multiple choice, one correct option) and Section B (numerical answer: type the number).</li>
          <li>Correct answer: <b>+4</b>. Wrong answer: <b>−1</b>. Not answered: 0. Negative marking applies to both sections.</li>
          <li>The clock starts when you press Start and runs for {test.duration_min} minutes, even if you close the page. When it reaches zero, the test is submitted automatically.</li>
          <li><b>An answer counts only after you press SAVE &amp; NEXT or SAVE &amp; MARK FOR REVIEW.</b> Choosing an option and moving away without saving does not keep it.</li>
          <li>Your answers are saved to the server as you go. If the internet drops or the page closes, open the test again and carry on.</li>
          <li>Switching to other apps or tabs is recorded.</li>
        </ol>
        <div className="space-y-2 pt-2">
          <p className="text-sm font-semibold text-slate-800">Question palette</p>
          {LEGEND.map(([cls, n, text]) => (
            <p key={n} className="flex items-center gap-3 text-sm text-slate-700">
              <span className={`grid h-8 w-8 shrink-0 place-items-center border text-xs font-bold ${cls}`}>{n}</span>
              {text}
            </p>
          ))}
        </div>
      </section>

      <section className="card space-y-3">
        {attempt?.status && attempt.status !== "in_progress" ? (
          <>
            <p className="text-slate-700">You have finished this test.</p>
            <Link href={`/results/${attempt.id}`} className="btn">View your report</Link>
          </>
        ) : attempt ? (
          <>
            <p className="text-slate-700">Your test is in progress and the clock is running.</p>
            <Link href={`/exam/${attempt.id}`} className="btn">Resume the test</Link>
          </>
        ) : opensLater && !staff ? (
          <p className="text-slate-700">This test opens on {formatDate(test.scheduled_date)}.</p>
        ) : (
          <>
            {staff && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Staff trial: you can take this paper now, even before its date or before it is
                published. It is kept out of the students&apos; ranks, and you can delete it afterwards.
              </p>
            )}
            <StartForm testId={test.id} label="Start the test" />
          </>
        )}
      </section>
    </div>
  );
}
