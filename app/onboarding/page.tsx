import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { getProfile } from "@/lib/auth";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Your details" };

export default async function OnboardingPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  return (
    <main className="flex flex-1 justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex justify-center">
          <Logo href={profile.onboarded_at ? "/dashboard" : "/"} />
        </div>
        <div className="card">
          <h1 className="text-xl font-bold text-slate-900">
            {profile.onboarded_at ? "Edit your details" : "Tell us about yourself"}
          </h1>
          <p className="mb-4 mt-1 text-sm text-slate-600">
            These details appear on your report card.
          </p>
          <ProfileForm profile={profile} />
        </div>
      </div>
    </main>
  );
}
