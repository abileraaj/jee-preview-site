import type { Metadata } from "next";
import { Logo } from "@/components/logo";
import { isSupabaseConfigured } from "@/lib/config";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Create account" };

export default function RegisterPage() {
  return (
    <main className="flex flex-1 items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        <div className="card">
          <h1 className="text-xl font-bold text-slate-900">Create a free account</h1>
          <p className="mt-1 text-sm text-slate-600">
            Free tests are open to every account. Paid tests unlock with a plan.
          </p>
          {isSupabaseConfigured ? (
            <RegisterForm />
          ) : (
            <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Registration is not set up yet. Add the Supabase keys to <code>.env.local</code>.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
