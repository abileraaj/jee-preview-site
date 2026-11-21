import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { IMAGE_BUCKET } from "@/lib/papers";

export type PaletteState = "not_visited" | "not_answered" | "answered" | "marked" | "answered_marked";

export type ExamOption = { label: string; body: string; image_path: string | null };

export type ExamQuestion = {
  position: number;
  question_id: string;
  subject: string;
  section: string;
  type: "mcq" | "numerical";
  marks_correct: number;
  marks_wrong: number;
  body: string;
  image_path: string | null;
  options: ExamOption[];
};

export type ExamResponse = {
  question_id: string;
  selected_option: string | null;
  numeric_answer: number | string | null;
  palette_state: PaletteState;
  time_spent_ms: number;
  visit_count: number;
};

export type AttemptPaper = {
  attempt: { id: string; status: string; started_at: string; deadline_at: string; now: string; is_trial: boolean };
  test: { id: string; code: string | null; title: string; duration_min: number };
  questions: ExamQuestion[];
  responses: ExamResponse[];
};

export type SaveItem = {
  question_id: string;
  selected_option: string | null;
  numeric_answer: string | null;
  palette_state: PaletteState;
  add_ms: number;
  add_visits: number;
};

export type ExamEvent = { kind: string; question_id?: string; details?: Record<string, unknown> };

// Temporary links for question pictures (storage is private). Uses the
// server's full-access key, so only call it after checking the user may
// see these questions.
export async function signImages(fallback: SupabaseClient, paths: (string | null | undefined)[]) {
  const unique = [...new Set(paths.filter((p): p is string => Boolean(p)))];
  const out: Record<string, string> = {};
  if (!unique.length) return out;
  const client = createAdminClient() ?? fallback;
  const { data } = await client.storage.from(IMAGE_BUCKET).createSignedUrls(unique, 6 * 3600);
  for (const d of data ?? []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
  return out;
}

export function formatDuration(ms: number) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}
