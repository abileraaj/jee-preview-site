import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadPaper } from "@/lib/papers";
import { Importer, type SlotInfo } from "./importer";

export const metadata: Metadata = { title: "Import questions" };

export default async function ImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireRole(["faculty", "admin"]);
  const supabase = await createClient();
  const loaded = await loadPaper(supabase, id);
  if (!loaded) notFound();
  const { paper, slots } = loaded;
  const locked = paper.status !== "draft" && profile.role !== "admin";

  const info: SlotInfo[] = slots.map((s) => ({
    position: s.position,
    subjectName: s.subjectName,
    sectionName: s.sectionName,
    type: s.type,
    filled: Boolean(s.question),
  }));

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/faculty/papers/${paper.id}`} className="text-sm font-medium text-brand-700 hover:underline">
          ← Back to {paper.code}
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">Import questions into {paper.code}</h1>
        <p className="mt-1 text-slate-600">
          Upload the question paper as a PDF or as photos of its pages. Each question is cut out as
          a picture, exactly as printed, with its options and diagrams.
        </p>
      </div>
      {locked ? (
        <p className="card bg-slate-50 text-slate-700">This paper is published. Only the admin can change it now.</p>
      ) : (
        <Importer testId={paper.id} paperCode={paper.code ?? "paper"} slots={info} />
      )}
    </div>
  );
}
