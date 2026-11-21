"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmAllQuestions, publishPaper, unpublishPaper, type ConfirmAllResult } from "../actions";

export function PublishBar({
  testId, status, filled, confirmed, total, awaiting,
}: {
  testId: string;
  status: string;
  filled: number;
  confirmed: number;
  total: number;
  awaiting: number; // saved, not yet confirmed, not sent back
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ConfirmAllResult | null>(null);
  const [pending, start] = useTransition();
  const ready = total > 0 && confirmed === total;

  const run = (fn: (id: string) => Promise<{ error: string | null }>) =>
    start(async () => {
      const r = await fn(testId);
      setError(r.error);
      if (!r.error) router.refresh();
    });

  function confirmAll() {
    const ok = window.confirm(
      `Confirm all ${awaiting} saved question${awaiting === 1 ? "" : "s"} that are waiting for you?\n\n` +
        "Only do this after checking them. Incomplete questions and ones sent back for correction are skipped.",
    );
    if (!ok) return;
    start(async () => {
      const r = await confirmAllQuestions(testId);
      setResult(r);
      setError(r.error);
      if (!r.error) router.refresh();
    });
  }

  // Empty slots are already obvious from the counts; list only real problems.
  const problems = result?.skipped.filter((s) => s.reason !== "not entered yet") ?? [];
  const notEntered = result?.skipped.filter((s) => s.reason === "not entered yet").length ?? 0;

  return (
    <div className="card space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-slate-700">
          {status === "published"
            ? "This paper is published. Students will see it from its scheduled date."
            : ready
              ? "Every question is confirmed. The paper can be published."
              : `${filled} of ${total} entered, ${confirmed} of ${total} confirmed. Publishing needs all ${total} confirmed.`}
        </p>
        <div className="flex flex-wrap gap-2">
          {status !== "published" && awaiting > 0 && (
            <button type="button" disabled={pending} onClick={confirmAll}
              className="btn bg-green-600 hover:bg-green-700">
              {pending ? "Working…" : `✓ Confirm all (${awaiting})`}
            </button>
          )}
          {status === "published" ? (
            <button type="button" disabled={pending} onClick={() => run(unpublishPaper)} className="btn-outline">
              Unpublish
            </button>
          ) : (
            <button type="button" disabled={pending || !ready} onClick={() => run(publishPaper)} className="btn">
              {pending ? "Publishing…" : "Publish to students"}
            </button>
          )}
        </div>
      </div>

      {result && !result.error && (
        <div className="space-y-1 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-900">
          <p>
            {result.confirmed} question{result.confirmed === 1 ? "" : "s"} confirmed.
            {notEntered > 0 && ` ${notEntered} not entered yet.`}
          </p>
          {problems.length > 0 && (
            <div className="text-amber-900">
              <p className="font-medium">Skipped, please check these:</p>
              <ul className="list-disc pl-5">
                {problems.map((s) => (
                  <li key={s.position}>
                    <a href={`#q${s.position}`} className="underline">Question {s.position}</a>: {s.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
