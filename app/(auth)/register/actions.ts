"use server";

import { createAdminClient, createMobileAccount, MISSING_KEY_MESSAGE } from "@/lib/supabase/admin";
import { MIN_PASSWORD, normalizeMobile } from "@/lib/student-login";

export type RegisterResult = { error: string | null; mobile?: string };

// Self-registration. Creates the account on the server; the browser then
// logs in with the same mobile number and password.
export async function registerStudent(input: {
  name: string;
  mobile: string;
  password: string;
  confirm: string;
}): Promise<RegisterResult> {
  const name = input.name.trim();
  const mobile = normalizeMobile(input.mobile);
  if (name.length < 2) return { error: "Please enter your full name." };
  if (!mobile) return { error: "Please enter a valid 10-digit mobile number." };
  if (input.password.length < MIN_PASSWORD) {
    return { error: `The password must have at least ${MIN_PASSWORD} characters.` };
  }
  if (input.password !== input.confirm) return { error: "The two passwords do not match." };

  const admin = createAdminClient();
  if (!admin) return { error: MISSING_KEY_MESSAGE };
  const result = await createMobileAccount(admin, { name: name.slice(0, 100), mobile, password: input.password });
  if (!result.ok) {
    return {
      error: result.exists
        ? "This mobile number already has an account. Please log in instead."
        : result.error,
    };
  }
  return { error: null, mobile };
}
