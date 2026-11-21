"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { mobileToLoginEmail, normalizeMobile } from "@/lib/student-login";

export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"mobile" | "email">("mobile");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    let loginEmail = email.trim().toLowerCase();
    if (mode === "mobile") {
      const m = normalizeMobile(mobile);
      if (!m) return setError("Enter your 10-digit mobile number.");
      loginEmail = mobileToLoginEmail(m);
    }
    setBusy(true);
    const { error } = await createClient().auth.signInWithPassword({ email: loginEmail, password });
    if (error) {
      setBusy(false);
      if (/fetch|network/i.test(error.message)) {
        return setError("Could not reach the server. Check your internet connection and try again.");
      }
      return setError(
        mode === "mobile"
          ? "Wrong mobile number or password. Forgot it? Ask your coordinator to reset it."
          : "Wrong email or password.",
      );
    }
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <div className="mt-4">
      <form onSubmit={submit} className="space-y-3">
        {mode === "mobile" ? (
          <div>
            <label htmlFor="mobile" className="label">Mobile number</label>
            <input id="mobile" required inputMode="numeric" autoComplete="tel-national" maxLength={14}
              className="field" placeholder="10-digit number" value={mobile}
              onChange={(e) => setMobile(e.target.value)} />
          </div>
        ) : (
          <div>
            <label htmlFor="email" className="label">Email</label>
            <input id="email" type="email" required autoComplete="email" className="field"
              value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        )}
        <div>
          <label htmlFor="password" className="label">Password</label>
          <input id="password" type="password" required autoComplete="current-password" className="field"
            value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button className="btn w-full" disabled={busy}>{busy ? "Logging in…" : "Log in"}</button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-600">
        New here? <Link href="/register" className="font-semibold text-brand-700 hover:underline">Create a free account</Link>
      </p>
      <button type="button" className="mt-3 w-full text-xs font-medium text-slate-500 hover:text-slate-800"
        onClick={() => { setMode(mode === "mobile" ? "email" : "mobile"); setError(null); }}>
        {mode === "mobile" ? "Staff: log in with email instead" : "Log in with mobile number instead"}
      </button>
    </div>
  );
}
