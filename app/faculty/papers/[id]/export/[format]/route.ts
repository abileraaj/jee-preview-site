import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { download, DOCX_TYPE, exportRows, rowsToXlsx, XLSX_TYPE } from "@/lib/export";
import { IMAGE_BUCKET, LABELS, loadPaper } from "@/lib/papers";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; format: string }> }) {
  const { id, format } = await params;
  await requireRole(["faculty", "admin"]);
  const supabase = await createClient();
  const loaded = await loadPaper(supabase, id);
  if (!loaded) notFound();
  const name = loaded.paper.code ?? "paper";

  if (format === "xlsx") {
    const rows = await exportRows(supabase, [loaded]);
    return download(await rowsToXlsx(rows), `${name}.xlsx`, XLSX_TYPE);
  }
  if (format !== "docx") notFound();

  const { Document, Packer, Paragraph, TextRun, ImageRun, HeadingLevel } = await import("docx");
  const { imageSize } = await import("image-size");

  // A picture from storage, scaled to fit the page width.
  async function picture(path: string | null, maxWidth: number) {
    if (!path) return null;
    const { data } = await supabase.storage.from(IMAGE_BUCKET).download(path);
    if (!data) return new Paragraph({ children: [new TextRun({ text: `[picture missing: ${path}]`, italics: true })] });
    const bytes = new Uint8Array(await data.arrayBuffer());
    try {
      const size = imageSize(bytes);
      const type = size.type === "png" ? "png" : size.type === "jpg" ? "jpg" : null;
      if (!type || !size.width || !size.height) throw new Error("unsupported");
      const scale = Math.min(1, maxWidth / size.width);
      return new Paragraph({
        children: [new ImageRun({
          data: bytes, type,
          transformation: { width: Math.round(size.width * scale), height: Math.round(size.height * scale) },
        })],
      });
    } catch {
      return new Paragraph({ children: [new TextRun({ text: `[picture: ${path}]`, italics: true })] });
    }
  }
  const lines = (text: string) =>
    text.split("\n").map((t, i) => new TextRun({ text: t, break: i === 0 ? 0 : 1 }));

  const body: InstanceType<typeof Paragraph>[] = [
    new Paragraph({ text: `${loaded.paper.code ?? ""} ${loaded.paper.title}`.trim(), heading: HeadingLevel.HEADING_1 }),
  ];
  const key: string[] = [];
  let subject = "";
  for (const s of loaded.slots) {
    if (s.subjectName !== subject) {
      subject = s.subjectName;
      body.push(new Paragraph({ text: subject, heading: HeadingLevel.HEADING_2, spacing: { before: 300 } }));
    }
    const q = s.question;
    body.push(new Paragraph({
      spacing: { before: 200 },
      children: [new TextRun({ text: `${s.position}. `, bold: true }), ...(q ? lines(q.body) : [new TextRun({ text: "(not entered)", italics: true })])],
    }));
    if (!q) continue;
    const img = await picture(q.imagePath, 480);
    if (img) body.push(img);
    if (s.type === "mcq") {
      for (const l of LABELS) {
        const o = q.options[l];
        if (!o.body && !o.imagePath) continue;
        body.push(new Paragraph({ indent: { left: 360 }, children: [new TextRun({ text: `(${l}) `, bold: true }), ...lines(o.body)] }));
        const oi = await picture(o.imagePath, 300);
        if (oi) body.push(oi);
      }
    }
    key.push(`${s.position}: ${s.type === "mcq" ? (q.correctOption ?? "") : (q.numericValue ?? "")}`);
  }
  body.push(new Paragraph({ text: "Answer key", heading: HeadingLevel.HEADING_2, pageBreakBefore: true }));
  body.push(new Paragraph({ children: [new TextRun(key.join("    "))] }));
  for (const s of loaded.slots) {
    if (s.question?.solution) {
      body.push(new Paragraph({
        spacing: { before: 160 },
        children: [new TextRun({ text: `Solution ${s.position}: `, bold: true }), ...lines(s.question.solution)],
      }));
    }
  }

  const doc = new Document({ sections: [{ children: body }] });
  const buffer = await Packer.toBuffer(doc);
  return download(new Uint8Array(buffer), `${name}.docx`, DOCX_TYPE);
}
