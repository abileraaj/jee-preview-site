/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, LABELS, loadPaper } from "@/lib/papers";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Print paper" };

// A clean, printable copy of the paper. "Save as PDF" in the browser's
// print window produces the PDF, with pictures exactly as entered.
export default async function PrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireRole(["faculty", "admin"]);
  const supabase = await createClient();
  const loaded = await loadPaper(supabase, id, { signImages: true });
  if (!loaded) notFound();
  const { paper, slots, imageUrls } = loaded;
  const subjects = [...new Set(slots.map((s) => s.subjectName))];

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/faculty/papers/${paper.id}`} className="text-sm font-medium text-brand-700 hover:underline">
          ← Back to the paper
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500">In the print window choose “Save as PDF”.</span>
          <PrintButton />
        </div>
      </div>

      <h1 className="text-xl font-bold text-slate-900">{paper.code}: {paper.title}</h1>
      <p className="text-sm text-slate-600">
        {formatDate(paper.scheduledDate)} · {slots.length} questions · {paper.durationMin} minutes
      </p>

      {subjects.map((name) => (
        <section key={name}>
          <h2 className="mt-6 border-b border-slate-300 pb-1 text-lg font-bold text-slate-900">{name}</h2>
          {slots.filter((s) => s.subjectName === name).map((s) => {
            const q = s.question;
            return (
              <div key={s.position} className="mt-4 break-inside-avoid">
                <p className="whitespace-pre-wrap text-slate-900">
                  <b>{s.position}.</b> {q ? q.body : <i className="text-slate-400">(not entered)</i>}
                </p>
                {q?.imagePath && imageUrls[q.imagePath] && (
                  <img src={imageUrls[q.imagePath]} alt="" className="mt-1 max-h-80 max-w-full" />
                )}
                {q && s.type === "mcq" && (
                  <div className="mt-1 space-y-1 pl-5">
                    {LABELS.map((l) => {
                      const o = q.options[l];
                      if (!o.body && !o.imagePath) return null;
                      return (
                        <div key={l} className="text-slate-900">
                          <b>({l})</b> <span className="whitespace-pre-wrap">{o.body}</span>
                          {o.imagePath && imageUrls[o.imagePath] && (
                            <img src={imageUrls[o.imagePath]} alt="" className="mt-1 max-h-40 max-w-full" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </section>
      ))}

      <section className="break-before-page">
        <h2 className="mt-8 border-b border-slate-300 pb-1 text-lg font-bold text-slate-900">Answer key</h2>
        <div className="mt-3 grid grid-cols-5 gap-x-4 gap-y-1 text-sm text-slate-900">
          {slots.map((s) => (
            <span key={s.position}>
              <b>{s.position}.</b>{" "}
              {s.question ? (s.type === "mcq" ? s.question.correctOption : s.question.numericValue) : ""}
            </span>
          ))}
        </div>
        {slots.filter((s) => s.question?.solution).map((s) => (
          <p key={s.position} className="mt-3 whitespace-pre-wrap text-sm text-slate-900">
            <b>Solution {s.position}:</b> {s.question!.solution}
          </p>
        ))}
      </section>
    </div>
  );
}
