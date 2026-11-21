import type { Metadata } from "next";
import { Logo } from "@/components/logo";
import { isSupabaseConfigured } from "@/lib/config";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        <div className="card">
          <h1 className="text-xl font-bold text-slate-900">Log in</h1>
          <p className="mt-1 text-sm text-slate-600">Use your mobile number and password.</p>
          {isSupabaseConfigured ? (
            <LoginForm />
          ) : (
            <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Login is not set up yet. Add the Supabase keys to <code>.env.local</code> (see the
              README) and restart.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
