"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const ROLES = ["student", "faculty", "admin"];

export async function setRole(formData: FormData) {
  const admin = await requireRole(["admin"]);
  const userId = String(formData.get("user_id") ?? "");
  const role = String(formData.get("role") ?? "");
  if (!userId || !ROLES.includes(role)) return;
  // An admin cannot change their own role, so there is always one admin left.
  if (userId === admin.id) return;

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ role }).eq("id", userId);
  if (!error) {
    await supabase.from("audit_log").insert({
      actor_id: admin.id,
      action: "set_role",
      target: userId,
      details: { role },
    });
  }
  revalidatePath("/admin");
}
