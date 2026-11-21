"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { INDIAN_STATES } from "@/lib/states";

export type ProfileFormState = { error: string | null };

const MOBILE = /^[6-9]\d{9}$/;

export async function saveProfile(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const text = (name: string) => String(formData.get(name) ?? "").trim();
  const fullName = text("full_name");
  const mobile = text("mobile");
  const classYear = text("class_year");
  const state = text("state");
  const age = text("age_group"); // "under18" | "adult"
  const guardianName = text("guardian_name");
  const guardianMobile = text("guardian_mobile");
  const consent = formData.get("guardian_consent") === "on";

  if (fullName.length < 2) return { error: "Please enter your full name." };
  if (!MOBILE.test(mobile)) return { error: "Please enter a valid 10-digit mobile number." };
  if (!["11", "12", "dropper"].includes(classYear)) return { error: "Please choose your class." };
  if (!INDIAN_STATES.includes(state)) return { error: "Please choose your state." };
  if (age !== "under18" && age !== "adult") return { error: "Please tell us if you are under 18." };

  const isMinor = age === "under18";
  if (isMinor) {
    if (guardianName.length < 2) return { error: "Please enter your parent or guardian's name." };
    if (!MOBILE.test(guardianMobile)) {
      return { error: "Please enter a valid 10-digit mobile number for your parent or guardian." };
    }
    if (guardianMobile === mobile) {
      return { error: "Your parent or guardian's mobile number must be different from yours." };
    }
    if (!consent) {
      return { error: "Your parent or guardian must agree before you can continue." };
    }
  }

  // Keep the first consent time if the profile is being edited later.
  const { data: existing } = await supabase
    .from("profiles")
    .select("onboarded_at, guardian_consent_at")
    .eq("id", user.id)
    .maybeSingle();

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: fullName,
      mobile,
      class_year: classYear,
      state,
      is_minor: isMinor,
      guardian_name: isMinor ? guardianName : null,
      guardian_mobile: isMinor ? guardianMobile : null,
      guardian_consent_at: isMinor ? (existing?.guardian_consent_at ?? now) : null,
      onboarded_at: existing?.onboarded_at ?? now,
    })
    .eq("id", user.id);

  if (error) return { error: "Could not save your details. Please try again." };

  revalidatePath("/", "layout");
  redirect(existing?.onboarded_at ? "/account" : "/dashboard");
}
