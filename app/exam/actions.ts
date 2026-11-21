"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ExamEvent, SaveItem } from "@/lib/exam";

export type StartState = { error: string | null };

function readable(message: string | undefined, fallback: string) {
  if (message && /^[A-Z]/.test(message) && message.length < 120 && !/violates|relation|column|syntax|function|permission|uuid/i.test(message)) {
    return message;
  }
  return fallback;
}

export async function startTest(testId: string, prev: StartState): Promise<StartState> {
  void prev;
  await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_attempt", { p_test: testId });
  if (error || !data) return { error: readable(error?.message, "The test could not be started. Please try again.") };
  redirect(`/exam/${data}`);
}

// Returns "ok", or the attempt's status when it can no longer be changed
// ("submitted", "auto_submitted", "expired").
export async function saveResponses(attemptId: string, items: SaveItem[], events: ExamEvent[]): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_responses", {
    p_attempt: attemptId,
    p_items: items,
    p_events: events,
  });
  if (error) throw new Error("save failed");
  return data as string;
}

export async function submitAttempt(attemptId: string): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_attempt", { p_attempt: attemptId });
  if (error) throw new Error("submit failed");
  revalidatePath("/dashboard");
  return data as string;
}

export async function discardTrial(attemptId: string, testId: string): Promise<void> {
  await requireProfile();
  const supabase = await createClient();
  await supabase.rpc("discard_trial_attempt", { p_attempt: attemptId });
  revalidatePath("/dashboard");
  redirect(`/tests/${testId}`);
}
