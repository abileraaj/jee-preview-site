import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile } from "@/lib/types";
import { AddStudentForm, ResetPasswordButton, UploadStudentsForm } from "./forms";

export const metadata: Metadata = { title: "Students" };

const CLASS_LABEL: Record<string, string> = { "11": "11", "12": "12", dropper: "Dropper" };

export default async function StudentsPage() {
  const admin = await requireRole(["admin"]);
  const supabase = await createClient();
  const { data, count } = await supabase
    .from("profiles")
    .select("*", { count: "exact" })
    .eq("role", "student")
    .order("created_at", { ascending: false })
    .limit(300);
  const students = (data ?? []) as Profile[];
  const keyMissing = createAdminClient() === null;

  return (
    <AppShell profile={admin}>
      <div className="space-y-6">
        <div>
          <Link href="/admin" className="text-sm font-medium text-brand-700 hover:underline">← Admin</Link>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Students</h1>
          <p className="mt-1 text-slate-600">
            Students can register themselves, or you can create their logins here and share the
            mobile number and password with them.
          </p>
        </div>

        {keyMissing && (
          <p className="card border-amber-300 bg-amber-50 text-sm text-amber-900">
            To create accounts, add <code>SUPABASE_SERVICE_ROLE_KEY</code> to <code>.env.local</code> and
            restart the app. The README explains where to find it.
          </p>
        )}

        <section className="card space-y-3">
          <h2 className="font-semibold text-slate-900">Add one student</h2>
          <AddStudentForm />
        </section>

        <section className="card space-y-3">
          <h2 className="font-semibold text-slate-900">Add many from Excel</h2>
          <p className="text-sm text-slate-600">
            Columns: Name, Mobile, Password. Leave Password empty to create one automatically.{" "}
            <a href="/admin/students/template" className="font-medium text-brand-700 underline">Download the template</a>
          </p>
          <UploadStudentsForm />
        </section>

        <section className="card overflow-x-auto p-0">
          <h2 className="px-5 pt-4 font-semibold text-slate-900">All students ({count ?? 0})</h2>
          {students.length === 0 ? (
            <p className="px-5 pb-4 pt-2 text-sm text-slate-500">No students yet.</p>
          ) : (
            <table className="mt-3 w-full min-w-[640px] text-left text-sm">
              <thead className="border-y border-slate-200 bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-5 py-2 font-medium">Name</th>
                  <th className="px-5 py-2 font-medium">Mobile</th>
                  <th className="px-5 py-2 font-medium">Class</th>
                  <th className="px-5 py-2 font-medium">Joined</th>
                  <th className="px-5 py-2 font-medium">Password</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {students.map((s) => (
                  <tr key={s.id}>
                    <td className="px-5 py-2 text-slate-900">{s.full_name ?? "Not filled in"}</td>
                    <td className="px-5 py-2 text-slate-600">{s.mobile ?? ""}</td>
                    <td className="px-5 py-2 text-slate-600">{s.class_year ? CLASS_LABEL[s.class_year] : ""}</td>
                    <td className="px-5 py-2 text-slate-600">
                      {new Date(s.created_at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}
                    </td>
                    <td className="px-5 py-2"><ResetPasswordButton userId={s.id} name={s.full_name ?? "this student"} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </AppShell>
  );
}
