"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { LABELS, loadPaper } from "@/lib/papers";

export type ActionResult = { error: string | null };

export type QuestionPayload = {
  body: string;
  image_path: string | null;
  options: Record<string, { body: string; image_path: string | null }>;
  correct_option: string | null;
  numeric_value: string;
  numeric_tolerance: string;
  chapter_id: string | null;
  topic_id: string | null;
  solution_body: string;
};

// Database messages written for people are passed through; anything else
// becomes a general message.
function friendly(message: string | undefined) {
  if (!message) return "Something went wrong. Please try again.";
  if (/invalid input syntax for type numeric/i.test(message)) return "The numerical answer must be a number.";
  const technical = /violates|relation|column|syntax|constraint|function|permission|schema|JSON|uuid/i;
  if (/^[A-Z]/.test(message) && message.length < 160 && !technical.test(message)) return message;
  return "Could not save. Please try again.";
}

export async function saveQuestion(
  testId: string,
  position: number,
  payload: QuestionPayload,
): Promise<ActionResult> {
  await requireRole(["faculty", "admin"]);
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_paper_question", {
    p_test: testId,
    p_position: position,
    p: payload,
  });
  if (error) return { error: friendly(error.message) };
  revalidatePath(`/faculty/papers/${testId}`);
  return { error: null };
}

export async function reviewQuestion(
  testId: string,
  questionId: string,
  decision: "reviewed" | "rejected" | "draft",
  note: string,
): Promise<ActionResult> {
  const admin = await requireRole(["admin"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("questions")
    .update({
      status: decision,
      review_note: decision === "rejected" ? note.trim() || null : null,
      reviewed_by: admin.id,
    })
    .eq("id", questionId);
  if (error) return { error: friendly(error.message) };
  revalidatePath(`/faculty/papers/${testId}`);
  return { error: null };
}

export async function updatePaperMeta(testId: string, formData: FormData): Promise<void> {
  const profile = await requireRole(["faculty", "admin"]);
  const supabase = await createClient();
  const { data: test } = await supabase.from("tests").select("status").eq("id", testId).maybeSingle();
  if (!test || (test.status !== "draft" && profile.role !== "admin")) return;

  const chapterIds = formData.getAll("chapter_ids").map(String).filter(Boolean);
  let title = String(formData.get("title") ?? "").trim();
  if (formData.get("title_from_chapters") === "on" && chapterIds.length) {
    const { data: chapters } = await supabase.from("chapters").select("name").in("id", chapterIds);
    title = (chapters ?? []).map((c) => c.name).join(", ");
  }
  if (title) await supabase.from("tests").update({ title: title.slice(0, 200) }).eq("id", testId);

  await supabase.from("test_chapters").delete().eq("test_id", testId);
  if (chapterIds.length) {
    await supabase.from("test_chapters").insert(chapterIds.map((id) => ({ test_id: testId, chapter_id: id })));
  }
  revalidatePath(`/faculty/papers/${testId}`);
  revalidatePath("/faculty");
}

export async function publishPaper(testId: string): Promise<ActionResult> {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const { error } = await supabase.rpc("publish_paper", { p_test: testId });
  if (error) return { error: friendly(error.message) };
  revalidatePath(`/faculty/papers/${testId}`);
  revalidatePath("/faculty");
  return { error: null };
}

export async function unpublishPaper(testId: string): Promise<ActionResult> {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const { count } = await supabase
    .from("attempts")
    .select("id", { count: "exact", head: true })
    .eq("test_id", testId);
  if ((count ?? 0) > 0) {
    return { error: "Students have already started this paper, so it cannot be unpublished." };
  }
  const { error } = await supabase.from("tests").update({ status: "draft" }).eq("id", testId);
  if (error) return { error: friendly(error.message) };
  revalidatePath(`/faculty/papers/${testId}`);
  revalidatePath("/faculty");
  return { error: null };
}

export type ConfirmAllResult = {
  error: string | null;
  confirmed: number;
  skipped: { position: number; reason: string }[];
};

// Confirms every saved question in the paper that is complete. Questions
// that are empty, incomplete or were sent back for correction are skipped
// and listed, so nothing half-done gets confirmed.
export async function confirmAllQuestions(testId: string): Promise<ConfirmAllResult> {
  const admin = await requireRole(["admin"]);
  const supabase = await createClient();
  const loaded = await loadPaper(supabase, testId);
  if (!loaded) return { error: "Paper not found.", confirmed: 0, skipped: [] };

  const ids: string[] = [];
  const skipped: { position: number; reason: string }[] = [];
  for (const s of loaded.slots) {
    const q = s.question;
    if (!q) {
      skipped.push({ position: s.position, reason: "not entered yet" });
      continue;
    }
    if (q.status === "reviewed" || q.status === "published") continue;
    if (q.status === "rejected") {
      skipped.push({ position: s.position, reason: "sent back for correction" });
      continue;
    }
    if (!q.body.trim() && !q.imagePath) {
      skipped.push({ position: s.position, reason: "no question text or picture" });
      continue;
    }
    if (s.type === "mcq") {
      if (!q.correctOption) {
        skipped.push({ position: s.position, reason: "no correct option chosen" });
        continue;
      }
      const missing = LABELS.filter((l) => !q.options[l].body.trim() && !q.options[l].imagePath);
      if (missing.length && !q.imagePath) {
        skipped.push({ position: s.position, reason: `option ${missing.join(", ")} missing` });
        continue;
      }
    } else if (q.numericValue === null || q.numericValue === "") {
      skipped.push({ position: s.position, reason: "no numerical answer" });
      continue;
    }
    ids.push(q.id);
  }

  if (ids.length) {
    const { error } = await supabase
      .from("questions")
      .update({ status: "reviewed", review_note: null, reviewed_by: admin.id })
      .in("id", ids)
      .eq("status", "draft");
    if (error) return { error: friendly(error.message), confirmed: 0, skipped };
    await supabase.from("audit_log").insert({
      actor_id: admin.id, action: "confirm_all", target: testId, details: { count: ids.length },
    });
  }
  revalidatePath(`/faculty/papers/${testId}`);
  revalidatePath("/faculty");
  return { error: null, confirmed: ids.length, skipped };
}
