import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, loadPaper, loadSyllabus } from "@/lib/papers";
import { updatePaperMeta } from "../actions";
import { PublishBar } from "./publish-bar";
import { QuestionCard } from "./question-card";

export const metadata: Metadata = { title: "Edit paper" };

export default async function PaperPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireRole(["faculty", "admin"]);
  const supabase = await createClient();
  const [loaded, syllabus] = await Promise.all([
    loadPaper(supabase, id, { signImages: true }),
    loadSyllabus(supabase),
  ]);
  if (!loaded) notFound();
  const { paper, slots, imageUrls } = loaded;

  const isAdmin = profile.role === "admin";
  const locked = paper.status !== "draft" && !isAdmin;
  const filled = slots.filter((s) => s.question).length;
  const confirmed = slots.filter((s) => s.question && ["reviewed", "published"].includes(s.question.status)).length;
  const awaiting = slots.filter((s) => s.question?.status === "draft").length;
  const subjects = [...new Set(slots.map((s) => s.subjectName))];
  const saveMeta = updatePaperMeta.bind(null, paper.id);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/faculty" className="text-sm font-medium text-brand-700 hover:underline">← All papers</Link>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">{paper.code}: {paper.title}</h1>
        <p className="mt-1 text-slate-600">
          Opens {formatDate(paper.scheduledDate)} · {slots.length} questions · {paper.durationMin} minutes
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {!locked && (
            <Link href={`/faculty/papers/${paper.id}/import`} className="btn">
              Import from PDF or photos
            </Link>
          )}
          <Link href={`/tests/${paper.id}`} className="btn-outline">
            Try as student
          </Link>
        </div>
      </div>

      <details className="card" open={paper.chapterIds.length === 0 && !locked}>
        <summary className="cursor-pointer font-semibold text-slate-900">Paper title and chapters</summary>
        <form action={saveMeta} className="mt-4 space-y-4">
          <fieldset disabled={locked} className="space-y-4">
            <div>
              <label htmlFor="title" className="label">Title</label>
              <input id="title" name="title" className="field" defaultValue={paper.title} maxLength={200} />
            </div>
            <div>
              <p className="label">Chapters covered</p>
              {syllabus.chapters.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No chapters uploaded yet.{" "}
                  {isAdmin ? <Link className="underline" href="/admin/chapters">Upload the chapter list</Link> : "Ask the admin to upload the chapter list."}
                </p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-3">
                  {syllabus.subjects.map((s) => (
                    <div key={s.id}>
                      <p className="mb-1 text-sm font-semibold text-slate-700">{s.name}</p>
                      <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                        {syllabus.chapters.filter((c) => c.subjectId === s.id).map((c) => (
                          <label key={c.id} className="flex items-start gap-2 text-sm text-slate-800">
                            <input type="checkbox" name="chapter_ids" value={c.id} className="mt-1"
                              defaultChecked={paper.chapterIds.includes(c.id)} />
                            {c.name}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-800">
              <input type="checkbox" name="title_from_chapters" />
              Use the selected chapter names as the title
            </label>
            <button className="btn-outline">Save title and chapters</button>
          </fieldset>
        </form>
      </details>

      {isAdmin && (
        <PublishBar testId={paper.id} status={paper.status} filled={filled} confirmed={confirmed} total={slots.length} awaiting={awaiting} />
      )}
      {locked && (
        <p className="card bg-slate-50 text-slate-700">
          This paper is published. Only the admin can change it now.
        </p>
      )}

      <div className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-200 bg-white/95 px-4 py-2 backdrop-blur">
        <span className="text-sm text-slate-600">{filled}/{slots.length} entered · {confirmed}/{slots.length} confirmed</span>
        <nav className="flex flex-wrap gap-2 text-sm font-medium">
          {subjects.map((name) => {
            const first = slots.find((s) => s.subjectName === name)!.position;
            return <a key={name} href={`#q${first}`} className="rounded-full bg-slate-100 px-3 py-1 text-slate-800 hover:bg-slate-200">{name}</a>;
          })}
        </nav>
        <span className="ml-auto flex flex-wrap gap-3 text-sm font-medium text-brand-700">
          <a href={`/faculty/papers/${paper.id}/export/xlsx`} className="hover:underline">Excel</a>
          <a href={`/faculty/papers/${paper.id}/export/docx`} className="hover:underline">Word</a>
          <Link href={`/faculty/papers/${paper.id}/print`} className="hover:underline">PDF / Print</Link>
        </span>
      </div>

      {subjects.map((name) => (
        <div key={name} className="space-y-3">
          <h2 className="text-lg font-bold text-slate-900">{name}</h2>
          {slots.filter((s) => s.subjectName === name).map((slot) => (
            <QuestionCard key={slot.position} testId={paper.id}
              paperCode={paper.code ?? "Q"} slot={slot} imageUrls={imageUrls}
              chapters={syllabus.chapters} topics={syllabus.topics} isAdmin={isAdmin} locked={locked} />
          ))}
        </div>
      ))}
    </div>
  );
}
