import type { Metadata } from "next";
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { isMobileLogin } from "@/lib/student-login";

export const metadata: Metadata = { title: "Account" };

const CLASS_LABEL = { "11": "Class 11", "12": "Class 12", dropper: "12th completed (dropper)" };

export default async function AccountPage() {
  const p = await requireProfile();
  const rows: [string, string][] = [
    ["Name", p.full_name ?? ""],
    ["Mobile", p.mobile ?? ""],
    ["Class", p.class_year ? CLASS_LABEL[p.class_year] : ""],
    ["State", p.state ?? ""],
  ];
  if (p.email && !isMobileLogin(p.email)) rows.splice(1, 0, ["Email", p.email]);
  if (p.is_minor) rows.push(["Parent or guardian", `${p.guardian_name} (${p.guardian_mobile})`]);
  if (p.role !== "student") rows.push(["Role", p.role]);

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-2xl font-bold text-slate-900">Account</h1>
      <dl className="card divide-y divide-slate-100 p-0">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 px-5 py-3">
            <dt className="text-slate-500">{k}</dt>
            <dd className="text-right font-medium text-slate-900">{v}</dd>
          </div>
        ))}
      </dl>
      <Link href="/onboarding" className="btn-outline">Edit details</Link>
    </div>
  );
}
