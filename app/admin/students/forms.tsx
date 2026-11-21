"use client";

import { useActionState, useState, useTransition } from "react";
import { addOneStudent, resetPassword, uploadStudents, type CreateState } from "./actions";

const initial: CreateState = { error: null, rows: [] };

function Results({ state }: { state: CreateState }) {
  if (state.error) return <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>;
  if (!state.rows.length) return null;
  const created = state.rows.filter((r) => r.status === "created");
  const csv = "Name,Mobile,Password\n" + created.map((r) => `"${r.name.replace(/"/g, '""')}",${r.mobile},${r.password}`).join("\n");
  return (
    <div className="space-y-2">
      <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
        {created.length} account{created.length === 1 ? "" : "s"} created.
        {state.rows.length > created.length && ` ${state.rows.length - created.length} skipped (see below).`}
        {" "}Note the passwords now: they are not shown again.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-slate-500">
            <tr><th className="py-1 pr-4 font-medium">Name</th><th className="py-1 pr-4 font-medium">Mobile</th><th className="py-1 pr-4 font-medium">Password</th><th className="py-1 font-medium">Result</th></tr>
          </thead>
          <tbody>
            {state.rows.map((r) => (
              <tr key={r.mobile} className="border-t border-slate-100">
                <td className="py-1 pr-4">{r.name}</td>
                <td className="py-1 pr-4">{r.mobile}</td>
                <td className="py-1 pr-4 font-mono">{r.password}</td>
                <td className={`py-1 ${r.status === "created" ? "text-green-700" : "text-red-700"}`}>
                  {r.status === "created" ? "Created" : r.note}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {created.length > 0 && (
        <a className="btn-outline px-3 py-2 text-sm" download="student-logins.csv"
          href={`data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`}>
          Download logins (opens in Excel)
        </a>
      )}
    </div>
  );
}

export function AddStudentForm() {
  const [state, action, pending] = useActionState(addOneStudent, initial);
  return (
    <div className="space-y-3">
      <form action={action} className="grid gap-3 sm:grid-cols-4">
        <input name="name" required placeholder="Student name" className="field" />
        <input name="mobile" required inputMode="numeric" maxLength={14} placeholder="Mobile number" className="field" />
        <input name="password" placeholder="Password (empty = automatic)" className="field" />
        <button className="btn" disabled={pending}>{pending ? "Creating…" : "Create account"}</button>
      </form>
      <Results state={state} />
    </div>
  );
}

export function UploadStudentsForm() {
  const [state, action, pending] = useActionState(uploadStudents, initial);
  return (
    <div className="space-y-3">
      <form action={action} className="flex flex-wrap items-center gap-3">
        <input type="file" name="file" accept=".xlsx" required
          className="text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:font-medium" />
        <button className="btn" disabled={pending}>{pending ? "Creating accounts…" : "Upload and create"}</button>
      </form>
      <Results state={state} />
    </div>
  );
}

export function ResetPasswordButton({ userId, name }: { userId: string; name: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ error: string | null; password: string | null } | null>(null);
  if (result?.password) {
    return <span className="text-sm">New password: <b className="font-mono">{result.password}</b></span>;
  }
  return (
    <span className="flex items-center gap-2">
      <button type="button" disabled={pending}
        className="rounded-md border border-slate-300 px-2 py-1 text-sm font-medium hover:bg-slate-50"
        onClick={() => {
          if (!confirm(`Reset the password for ${name}? Their old password will stop working.`)) return;
          start(async () => setResult(await resetPassword(userId)));
        }}>
        {pending ? "Resetting…" : "Reset password"}
      </button>
      {result?.error && <span className="text-sm text-red-700">{result.error}</span>}
    </span>
  );
}
