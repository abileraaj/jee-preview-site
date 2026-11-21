import { requireRole } from "@/lib/auth";
import { download, XLSX_TYPE } from "@/lib/export";

export async function GET() {
  await requireRole(["admin"]);
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Chapters");
  ws.columns = [
    { header: "Subject", key: "s", width: 16 },
    { header: "Chapter", key: "c", width: 34 },
    { header: "Topic", key: "t", width: 40 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.addRows([
    { s: "Physics", c: "Kinematics", t: "Motion in a straight line" },
    { s: "Physics", c: "Kinematics", t: "Projectile motion" },
    { s: "Chemistry", c: "Chemical Bonding", t: "VSEPR theory" },
    { s: "Mathematics", c: "Quadratic Equations", t: "Nature of roots" },
  ]);
  return download((await wb.xlsx.writeBuffer()) as ArrayBuffer, "chapter-list-template.xlsx", XLSX_TYPE);
}
