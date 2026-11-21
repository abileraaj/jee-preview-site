import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadSyllabus } from "@/lib/papers";
import { UploadForm } from "./upload-form";

export const metadata: Metadata = { title: "Chapters" };

export default async function ChaptersPage() {
  const admin = await requireRole(["admin"]);
  const supabase = await createClient();
  const { subjects, chapters, topics } = await loadSyllabus(supabase);

  return (
    <AppShell profile={admin}>
      <div className="space-y-6">
        <div>
          <Link href="/faculty" className="text-sm font-medium text-brand-700 hover:underline">← Question papers</Link>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Chapters and topics</h1>
          <p className="mt-1 text-slate-600">
            This list fills the chapter and topic drop-downs on every paper and question.
          </p>
        </div>

        <section className="card space-y-3">
          <h2 className="font-semibold text-slate-900">Upload from Excel</h2>
          <p className="text-sm text-slate-600">
            Three columns: Subject, Chapter, Topic. One row per topic; repeat the chapter name on
            each row. Subjects must be Physics, Chemistry or Mathematics. Uploading again only adds
            what is new.{" "}
            <a href="/admin/chapters/template" className="font-medium text-brand-700 underline">Download the template</a>
          </p>
          <UploadForm />
        </section>

        <div className="grid gap-4 md:grid-cols-3">
          {subjects.map((s) => {
            const list = chapters.filter((c) => c.subjectId === s.id);
            return (
              <section key={s.id} className="card">
                <h2 className="font-semibold text-slate-900">{s.name} <span className="font-normal text-slate-500">({list.length})</span></h2>
                {list.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">No chapters yet.</p>
                ) : (
                  <ul className="mt-2 space-y-2 text-sm">
                    {list.map((c) => {
                      const ts = topics.filter((t) => t.chapterId === c.id);
                      return (
                        <li key={c.id}>
                          <span className="font-medium text-slate-800">{c.name}</span>
                          {ts.length > 0 && <span className="text-slate-500">: {ts.map((t) => t.name).join(", ")}</span>}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
