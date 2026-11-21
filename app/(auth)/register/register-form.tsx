"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { MIN_PASSWORD, mobileToLoginEmail } from "@/lib/student-login";
import { registerStudent } from "./actions";

export function RegisterForm() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", mobile: "", password: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await registerStudent(form);
    if (result.error || !result.mobile) {
      setBusy(false);
      return setError(result.error ?? "Something went wrong. Please try again.");
    }
    const { error } = await createClient().auth.signInWithPassword({
      email: mobileToLoginEmail(result.mobile),
      password: form.password,
    });
    if (error) {
      router.replace("/login");
      return;
    }
    router.replace("/onboarding");
    router.refresh();
  }

  return (
    <div className="mt-4">
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label htmlFor="name" className="label">Full name</label>
          <input id="name" required autoComplete="name" className="field" value={form.name} onChange={set("name")} />
        </div>
        <div>
          <label htmlFor="mobile" className="label">Mobile number</label>
          <input id="mobile" required inputMode="numeric" autoComplete="tel-national" maxLength={14}
            className="field" placeholder="10-digit number" value={form.mobile} onChange={set("mobile")} />
        </div>
        <div>
          <label htmlFor="password" className="label">Create a password</label>
          <input id="password" type="password" required minLength={MIN_PASSWORD} autoComplete="new-password"
            className="field" placeholder={`At least ${MIN_PASSWORD} characters`} value={form.password}
            onChange={set("password")} />
        </div>
        <div>
          <label htmlFor="confirm" className="label">Type the password again</label>
          <input id="confirm" type="password" required autoComplete="new-password" className="field"
            value={form.confirm} onChange={set("confirm")} />
        </div>
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button className="btn w-full" disabled={busy}>{busy ? "Creating your account…" : "Create free account"}</button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-600">
        Already registered? <Link href="/login" className="font-semibold text-brand-700 hover:underline">Log in</Link>
      </p>
    </div>
  );
}
