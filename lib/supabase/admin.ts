import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mobileToLoginEmail } from "@/lib/student-login";

// Full-access Supabase client for server code that creates accounts or
// resets passwords. It bypasses row-level security, so each caller must
// check who is asking first.
export function createAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export const MISSING_KEY_MESSAGE =
  "Account creation is not set up yet: add SUPABASE_SERVICE_ROLE_KEY to .env.local and restart (see the README).";

export type CreateResult = { ok: true; userId: string } | { ok: false; error: string; exists?: boolean };

// Creates a student account that logs in with mobile number + password.
export async function createMobileAccount(
  admin: SupabaseClient,
  input: { name: string; mobile: string; password: string },
): Promise<CreateResult> {
  const { data, error } = await admin.auth.admin.createUser({
    email: mobileToLoginEmail(input.mobile),
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.name, mobile: input.mobile },
  });
  if (error || !data.user) {
    if (/already|registered|exists/i.test(error?.message ?? "")) {
      return { ok: false, error: "This mobile number already has an account.", exists: true };
    }
    if (/fetch|network/i.test(error?.message ?? "")) {
      return { ok: false, error: "Could not reach the server. Check the internet connection." };
    }
    return { ok: false, error: "The account could not be created. Please try again." };
  }
  // The signup trigger made the profile row; add the name and mobile.
  await admin.from("profiles").update({ full_name: input.name, mobile: input.mobile }).eq("id", data.user.id);
  return { ok: true, userId: data.user.id };
}

// Readable random password, e.g. "tn4k7p2x". No look-alike characters.
export function generatePassword() {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return "tn" + Array.from(bytes, (b) => chars[b % chars.length]).join("");
}
