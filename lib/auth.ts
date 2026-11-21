import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/config";
import type { Profile, Role } from "@/lib/types";

// The logged-in user's profile, or null when nobody is logged in.
export async function getProfile(): Promise<Profile | null> {
  // Private pages depend on who is asking, so they are never prebuilt.
  await connection();
  if (!isSupabaseConfigured) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  return (data as Profile | null) ?? null;
}

// For private pages: sends visitors to login, and new users to onboarding.
export async function requireProfile(): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!profile.onboarded_at) redirect("/onboarding");
  return profile;
}

// For staff pages: anyone without one of the given roles goes to the dashboard.
export async function requireRole(roles: Role[]): Promise<Profile> {
  const profile = await requireProfile();
  if (!roles.includes(profile.role)) redirect("/dashboard");
  return profile;
}
