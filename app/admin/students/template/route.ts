import { requireRole } from "@/lib/auth";
import { download, XLSX_TYPE } from "@/lib/export";

export async function GET() {
  await requireRole(["admin"]);
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Students");
  ws.columns = [
    { header: "Name", key: "n", width: 28 },
    { header: "Mobile", key: "m", width: 16 },
    { header: "Password", key: "p", width: 20 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.getColumn(2).numFmt = "@";
  ws.addRows([
    { n: "Sample Student One", m: "9876543210", p: "" },
    { n: "Sample Student Two", m: "9123456780", p: "mypass123" },
  ]);
  return download((await wb.xlsx.writeBuffer()) as ArrayBuffer, "student-list-template.xlsx", XLSX_TYPE);
}
