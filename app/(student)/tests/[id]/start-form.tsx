"use client";

import { useActionState } from "react";
import { startTest, type StartState } from "@/app/exam/actions";

export function StartForm({ testId, label }: { testId: string; label: string }) {
  const [state, action, pending] = useActionState(startTest.bind(null, testId), { error: null } as StartState);
  return (
    <form action={action} className="space-y-3">
      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input type="checkbox" required className="mt-1" />
        I have read the instructions.
      </label>
      <button className="btn w-full sm:w-auto" disabled={pending}>{pending ? "Opening…" : label}</button>
      {state.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
    </form>
  );
}
