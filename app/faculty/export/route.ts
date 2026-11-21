import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { download, exportRows, loadAllPapers, rowsToXlsx, XLSX_TYPE } from "@/lib/export";

// Every question in every paper, as one Excel file.
export async function GET() {
  await requireRole(["faculty", "admin"]);
  const supabase = await createClient();
  const rows = await exportRows(supabase, await loadAllPapers(supabase));
  return download(await rowsToXlsx(rows), "all-questions.xlsx", XLSX_TYPE);
}
