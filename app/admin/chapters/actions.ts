"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type UploadState = { error: string | null; message: string | null };

// Reads an Excel sheet with the columns Subject | Chapter | Topic and adds
// any chapters and topics that are not there yet. Nothing is deleted.
export async function uploadChapters(_prev: UploadState, formData: FormData): Promise<UploadState> {
  await requireRole(["admin"]);
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an Excel file first.", message: null };
  if (file.size > 2 * 1024 * 1024) return { error: "That file is larger than 2 MB.", message: null };

  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(await file.arrayBuffer());
  } catch {
    return { error: "That file could not be read. Please upload an .xlsx file.", message: null };
  }
  const ws = wb.worksheets[0];
  if (!ws) return { error: "The file has no sheets.", message: null };

  const supabase = await createClient();
  const { data: subjects } = await supabase.from("subjects").select("id, name");
  const subjectId = new Map((subjects ?? []).map((s) => [String(s.name).toLowerCase(), s.id as string]));
  const alias: Record<string, string> = { maths: "mathematics", math: "mathematics" };

  type Row = { subject: string; chapter: string; topic: string };
  const rows: Row[] = [];
  const problems: string[] = [];
  ws.eachRow((row, n) => {
    const cell = (i: number) => row.getCell(i).text.trim();
    const [subject, chapter, topic] = [cell(1), cell(2), cell(3)];
    if (n === 1 && subject.toLowerCase() === "subject") return; // header
    if (!subject && !chapter && !topic) return;
    const key = alias[subject.toLowerCase()] ?? subject.toLowerCase();
    if (!subjectId.has(key)) return void problems.push(`Row ${n}: unknown subject "${subject}"`);
    if (!chapter) return void problems.push(`Row ${n}: chapter is empty`);
    rows.push({ subject: key, chapter, topic });
  });
  if (problems.length) {
    return {
      error: `Nothing was saved. Fix these rows and upload again: ${problems.slice(0, 8).join("; ")}${problems.length > 8 ? ` and ${problems.length - 8} more` : ""}.`,
      message: null,
    };
  }
  if (!rows.length) return { error: "No rows found. Use the columns Subject, Chapter, Topic.", message: null };

  const { data: existingChapters } = await supabase.from("chapters").select("id, subject_id, name");
  const chapterId = new Map((existingChapters ?? []).map((c) => [`${c.subject_id}|${String(c.name).toLowerCase()}`, c.id as string]));
  let addedChapters = 0;
  let order = existingChapters?.length ?? 0;
  for (const r of rows) {
    const sid = subjectId.get(r.subject)!;
    const k = `${sid}|${r.chapter.toLowerCase()}`;
    if (chapterId.has(k)) continue;
    const { data, error } = await supabase
      .from("chapters").insert({ subject_id: sid, name: r.chapter, sort_order: ++order }).select("id").single();
    if (error || !data) return { error: `Could not save chapter "${r.chapter}".`, message: null };
    chapterId.set(k, data.id);
    addedChapters++;
  }

  const { data: existingTopics } = await supabase.from("topics").select("chapter_id, name");
  const seen = new Set((existingTopics ?? []).map((t) => `${t.chapter_id}|${String(t.name).toLowerCase()}`));
  const newTopics: { chapter_id: string; name: string; sort_order: number }[] = [];
  for (const r of rows) {
    if (!r.topic) continue;
    const cid = chapterId.get(`${subjectId.get(r.subject)}|${r.chapter.toLowerCase()}`)!;
    const k = `${cid}|${r.topic.toLowerCase()}`;
    if (seen.has(k)) continue;
    seen.add(k);
    newTopics.push({ chapter_id: cid, name: r.topic, sort_order: seen.size });
  }
  if (newTopics.length) {
    const { error } = await supabase.from("topics").insert(newTopics);
    if (error) return { error: "Chapters were saved but the topics could not be.", message: null };
  }

  revalidatePath("/admin/chapters");
  return {
    error: null,
    message: `Added ${addedChapters} chapter${addedChapters === 1 ? "" : "s"} and ${newTopics.length} topic${newTopics.length === 1 ? "" : "s"}. Rows already in the list were skipped.`,
  };
}
