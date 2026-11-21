"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import {
  createAdminClient, createMobileAccount, generatePassword, MISSING_KEY_MESSAGE,
} from "@/lib/supabase/admin";
import { MIN_PASSWORD, normalizeMobile } from "@/lib/student-login";

export type CreatedRow = { name: string; mobile: string; password: string; status: "created" | "exists" | "error"; note?: string };
export type CreateState = { error: string | null; rows: CreatedRow[] };

async function createMany(input: { name: string; mobile: string; password: string }[]): Promise<CreateState> {
  await requireRole(["admin"]);
  const admin = createAdminClient();
  if (!admin) return { error: MISSING_KEY_MESSAGE, rows: [] };
  const rows: CreatedRow[] = [];
  for (const r of input) {
    const password = r.password || generatePassword();
    const result = await createMobileAccount(admin, { name: r.name, mobile: r.mobile, password });
    rows.push(
      result.ok
        ? { name: r.name, mobile: r.mobile, password, status: "created" }
        : { name: r.name, mobile: r.mobile, password: "", status: result.exists ? "exists" : "error", note: result.error },
    );
  }
  revalidatePath("/admin/students");
  return { error: null, rows };
}

export async function addOneStudent(_prev: CreateState, formData: FormData): Promise<CreateState> {
  const name = String(formData.get("name") ?? "").trim();
  const mobile = normalizeMobile(String(formData.get("mobile") ?? ""));
  const password = String(formData.get("password") ?? "").trim();
  if (name.length < 2) return { error: "Enter the student's name.", rows: [] };
  if (!mobile) return { error: "Enter a valid 10-digit mobile number.", rows: [] };
  if (password && password.length < MIN_PASSWORD) {
    return { error: `The password must have at least ${MIN_PASSWORD} characters, or leave it empty.`, rows: [] };
  }
  return createMany([{ name: name.slice(0, 100), mobile, password }]);
}

// Excel columns: Name | Mobile | Password (optional).
export async function uploadStudents(_prev: CreateState, formData: FormData): Promise<CreateState> {
  await requireRole(["admin"]);
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an Excel file first.", rows: [] };
  if (file.size > 2 * 1024 * 1024) return { error: "That file is larger than 2 MB.", rows: [] };

  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(await file.arrayBuffer());
  } catch {
    return { error: "That file could not be read. Please upload an .xlsx file.", rows: [] };
  }
  const ws = wb.worksheets[0];
  if (!ws) return { error: "The file has no sheets.", rows: [] };

  const list: { name: string; mobile: string; password: string }[] = [];
  const problems: string[] = [];
  const seen = new Set<string>();
  ws.eachRow((row, n) => {
    const cell = (i: number) => row.getCell(i).text.trim();
    const [name, rawMobile, password] = [cell(1), cell(2), cell(3)];
    if (n === 1 && name.toLowerCase() === "name") return;
    if (!name && !rawMobile) return;
    const mobile = normalizeMobile(rawMobile);
    if (name.length < 2) return void problems.push(`Row ${n}: name is missing`);
    if (!mobile) return void problems.push(`Row ${n}: "${rawMobile}" is not a valid mobile number`);
    if (seen.has(mobile)) return void problems.push(`Row ${n}: ${mobile} appears twice`);
    if (password && password.length < MIN_PASSWORD) return void problems.push(`Row ${n}: password is shorter than ${MIN_PASSWORD} characters`);
    seen.add(mobile);
    list.push({ name: name.slice(0, 100), mobile, password });
  });
  if (problems.length) {
    return {
      error: `Nothing was created. Fix these rows and upload again: ${problems.slice(0, 8).join("; ")}${problems.length > 8 ? ` and ${problems.length - 8} more` : ""}.`,
      rows: [],
    };
  }
  if (!list.length) return { error: "No students found. Use the columns Name, Mobile, Password.", rows: [] };
  if (list.length > 300) return { error: "Please upload at most 300 students at a time.", rows: [] };
  return createMany(list);
}

export type ResetState = { error: string | null; password: string | null };

export async function resetPassword(userId: string): Promise<ResetState> {
  const me = await requireRole(["admin"]);
  if (userId === me.id) return { error: "Change your own password from the Supabase dashboard.", password: null };
  const admin = createAdminClient();
  if (!admin) return { error: MISSING_KEY_MESSAGE, password: null };
  const password = generatePassword();
  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) return { error: "The password could not be reset. Please try again.", password: null };
  await admin.from("audit_log").insert({ actor_id: me.id, action: "reset_password", target: userId });
  return { error: null, password };
}
