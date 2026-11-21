import type { SupabaseClient } from "@supabase/supabase-js";
import { LABELS, loadPaper, loadSyllabus, type LoadedPaper } from "@/lib/papers";

export type ExportRow = {
  paper: string;
  questionId: string;
  number: number;
  subject: string;
  section: string;
  type: string;
  chapter: string;
  topic: string;
  question: string;
  questionPicture: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  answer: string;
  solution: string;
  status: string;
};

const STATUS: Record<string, string> = {
  draft: "Awaiting confirmation",
  reviewed: "Confirmed",
  rejected: "Needs correction",
  published: "Published",
};

export async function exportRows(supabase: SupabaseClient, loaded: LoadedPaper[]): Promise<ExportRow[]> {
  const syllabus = await loadSyllabus(supabase);
  const chapter = new Map(syllabus.chapters.map((c) => [c.id, c.name]));
  const topic = new Map(syllabus.topics.map((t) => [t.id, t.name]));
  const rows: ExportRow[] = [];
  for (const { paper, slots } of loaded) {
    for (const s of slots) {
      const q = s.question;
      if (!q) continue;
      const opt = (l: (typeof LABELS)[number]) => {
        const o = q.options[l];
        return [o.body, o.imagePath ? `[picture: ${o.imagePath}]` : ""].filter(Boolean).join(" ");
      };
      rows.push({
        paper: paper.code ?? paper.title,
        questionId: q.code ?? "",
        number: s.position,
        subject: s.subjectName,
        section: s.sectionName,
        type: s.type === "mcq" ? "Multiple choice" : "Numerical",
        chapter: q.chapterId ? (chapter.get(q.chapterId) ?? "") : "",
        topic: q.topicId ? (topic.get(q.topicId) ?? "") : "",
        question: q.body,
        questionPicture: q.imagePath ?? "",
        optionA: opt("A"), optionB: opt("B"), optionC: opt("C"), optionD: opt("D"),
        answer: s.type === "mcq" ? (q.correctOption ?? "") : (q.numericValue ?? ""),
        solution: q.solution ?? "",
        status: STATUS[q.status] ?? q.status,
      });
    }
  }
  return rows;
}

export async function rowsToXlsx(rows: ExportRow[]): Promise<ArrayBuffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Questions");
  ws.columns = [
    { header: "Paper", key: "paper", width: 10 },
    { header: "Question ID", key: "questionId", width: 14 },
    { header: "No.", key: "number", width: 6 },
    { header: "Subject", key: "subject", width: 14 },
    { header: "Section", key: "section", width: 11 },
    { header: "Type", key: "type", width: 16 },
    { header: "Chapter", key: "chapter", width: 24 },
    { header: "Topic", key: "topic", width: 24 },
    { header: "Question", key: "question", width: 60 },
    { header: "Question picture file", key: "questionPicture", width: 30 },
    { header: "Option A", key: "optionA", width: 24 },
    { header: "Option B", key: "optionB", width: 24 },
    { header: "Option C", key: "optionC", width: 24 },
    { header: "Option D", key: "optionD", width: 24 },
    { header: "Answer", key: "answer", width: 10 },
    { header: "Solution", key: "solution", width: 60 },
    { header: "Status", key: "status", width: 22 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  for (const r of rows) ws.addRow(r).alignment = { wrapText: true, vertical: "top" };
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

export async function loadAllPapers(supabase: SupabaseClient): Promise<LoadedPaper[]> {
  const { data: tests } = await supabase.from("tests").select("id").order("scheduled_date").order("code");
  const out: LoadedPaper[] = [];
  for (const t of tests ?? []) {
    const p = await loadPaper(supabase, t.id as string);
    if (p) out.push(p);
  }
  return out;
}

export function download(body: ArrayBuffer | Uint8Array, filename: string, type: string) {
  return new Response(body as BodyInit, {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${filename.replace(/[^A-Za-z0-9._-]/g, "_")}"`,
      "Cache-Control": "no-store",
    },
  });
}

export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
