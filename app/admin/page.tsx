import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { isMobileLogin } from "@/lib/student-login";
import { setRole } from "./actions";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminPage() {
  const admin = await requireRole(["admin"]);
  const supabase = await createClient();
  const { data, count } = await supabase
    .from("profiles")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(100);
  const people = (data ?? []) as Profile[];
  const staff = people.filter((p) => p.role !== "student").length;

  return (
    <AppShell profile={admin}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-slate-900">Admin</h1>
          <div className="flex gap-2">
            <Link href="/admin/students" className="btn-outline px-3 py-2 text-sm">Students</Link>
            <Link href="/faculty" className="btn-outline px-3 py-2 text-sm">Question papers</Link>
            <Link href="/admin/chapters" className="btn-outline px-3 py-2 text-sm">Chapters</Link>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="card">
            <p className="text-sm text-slate-500">Registered users</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{count ?? 0}</p>
          </div>
          <div className="card">
            <p className="text-sm text-slate-500">Faculty and admins (in the latest 100)</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{staff}</p>
          </div>
        </div>

        <section className="card overflow-x-auto p-0">
          <h2 className="px-5 pt-4 font-semibold text-slate-900">Latest 100 users</h2>
          <table className="mt-3 w-full min-w-[640px] text-left text-sm">
            <thead className="border-y border-slate-200 bg-slate-50 text-slate-500">
              <tr>
                <th className="px-5 py-2 font-medium">Name</th>
                <th className="px-5 py-2 font-medium">Login</th>
                <th className="px-5 py-2 font-medium">Class</th>
                <th className="px-5 py-2 font-medium">Joined</th>
                <th className="px-5 py-2 font-medium">Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {people.map((p) => (
                <tr key={p.id}>
                  <td className="px-5 py-2 text-slate-900">{p.full_name ?? "Not filled in"}</td>
                  <td className="px-5 py-2 text-slate-600">{isMobileLogin(p.email) ? p.mobile : p.email}</td>
                  <td className="px-5 py-2 text-slate-600">{p.class_year ?? ""}</td>
                  <td className="px-5 py-2 text-slate-600">
                    {new Date(p.created_at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}
                  </td>
                  <td className="px-5 py-2">
                    {p.id === admin.id ? (
                      <span className="text-slate-600">admin (you)</span>
                    ) : (
                      <form action={setRole} className="flex items-center gap-2">
                        <input type="hidden" name="user_id" value={p.id} />
                        <select name="role" defaultValue={p.role}
                          className="rounded-md border border-slate-300 px-2 py-1">
                          <option value="student">student</option>
                          <option value="faculty">faculty</option>
                          <option value="admin">admin</option>
                        </select>
                        <button className="rounded-md border border-slate-300 px-2 py-1 font-medium hover:bg-slate-50">
                          Save
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </AppShell>
  );
}
