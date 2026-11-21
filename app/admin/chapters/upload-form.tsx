"use client";

import { useActionState } from "react";
import { uploadChapters, type UploadState } from "./actions";

const initial: UploadState = { error: null, message: null };

export function UploadForm() {
  const [state, action, pending] = useActionState(uploadChapters, initial);
  return (
    <form action={action} className="space-y-3">
      <input type="file" name="file" accept=".xlsx" required
        className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:font-medium" />
      <button className="btn" disabled={pending}>{pending ? "Uploading…" : "Upload chapter list"}</button>
      {state.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {state.message && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{state.message}</p>}
    </form>
  );
}
