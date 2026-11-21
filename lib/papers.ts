import type { SupabaseClient } from "@supabase/supabase-js";

export const IMAGE_BUCKET = "question-images";
export const LABELS = ["A", "B", "C", "D"] as const;
export type Label = (typeof LABELS)[number];

export type PaperQuestion = {
  id: string;
  code: string | null;
  body: string;
  imagePath: string | null;
  status: "draft" | "reviewed" | "rejected" | "published";
  reviewNote: string | null;
  chapterId: string | null;
  topicId: string | null;
  options: Record<Label, { body: string; imagePath: string | null }>;
  correctOption: Label | null;
  numericValue: string | null;
  numericTolerance: string | null;
  solution: string | null;
};

export type Slot = {
  position: number;
  sectionName: string;
  subjectId: string;
  subjectName: string;
  type: "mcq" | "numerical";
  marksCorrect: number;
  marksWrong: number;
  question: PaperQuestion | null;
};

export type Paper = {
  id: string;
  code: string | null;
  title: string;
  type: string;
  status: "draft" | "published" | "archived";
  scheduledDate: string | null;
  durationMin: number;
  chapterIds: string[];
};

export type LoadedPaper = {
  paper: Paper;
  slots: Slot[];
  imageUrls: Record<string, string>; // storage path -> temporary link
};

// Everything about one paper: its numbered slots and whatever question
// sits in each. Uses simple queries joined here, so each stays small.
export async function loadPaper(
  supabase: SupabaseClient,
  testId: string,
  opts: { signImages?: boolean } = {},
): Promise<LoadedPaper | null> {
  const { data: t } = await supabase.from("tests").select("*").eq("id", testId).maybeSingle();
  if (!t) return null;

  const [{ data: sections }, { data: subjects }, { data: tqs }, { data: tcs }] = await Promise.all([
    supabase.from("test_sections").select("*").eq("test_id", testId).order("sort_order"),
    supabase.from("subjects").select("id, name"),
    supabase.from("test_questions").select("question_id, position").eq("test_id", testId),
    supabase.from("test_chapters").select("chapter_id").eq("test_id", testId),
  ]);

  const ids = (tqs ?? []).map((r) => r.question_id as string);
  const [{ data: questions }, { data: options }, { data: answers }] = ids.length
    ? await Promise.all([
        supabase.from("questions").select("*").in("id", ids),
        supabase.from("question_options").select("*").in("question_id", ids),
        supabase.from("question_answers").select("*").in("question_id", ids),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  const subjectName = new Map((subjects ?? []).map((s) => [s.id as string, s.name as string]));
  const questionById = new Map((questions ?? []).map((q) => [q.id as string, q]));
  const answerById = new Map((answers ?? []).map((a) => [a.question_id as string, a]));
  const questionAt = new Map((tqs ?? []).map((r) => [r.position as number, r.question_id as string]));

  const slots: Slot[] = [];
  let position = 0;
  for (const s of sections ?? []) {
    for (let i = 0; i < (s.question_count as number); i++) {
      position += 1;
      const qid = questionAt.get(position);
      const q = qid ? questionById.get(qid) : undefined;
      let question: PaperQuestion | null = null;
      if (q) {
        const a = answerById.get(q.id as string);
        const opts = Object.fromEntries(
          LABELS.map((l) => [l, { body: "", imagePath: null as string | null }]),
        ) as PaperQuestion["options"];
        for (const o of options ?? []) {
          if (o.question_id === q.id && LABELS.includes(o.label)) {
            opts[o.label as Label] = { body: o.body ?? "", imagePath: o.image_path ?? null };
          }
        }
        question = {
          id: q.id,
          code: q.code ?? null,
          body: q.body ?? "",
          imagePath: (q.image_paths as string[] | null)?.[0] ?? null,
          status: q.status,
          reviewNote: q.review_note ?? null,
          chapterId: q.chapter_id ?? null,
          topicId: q.topic_id ?? null,
          options: opts,
          correctOption: a?.correct_option ?? null,
          numericValue: a?.numeric_value != null ? String(a.numeric_value) : null,
          numericTolerance: a?.numeric_tolerance != null ? String(a.numeric_tolerance) : null,
          solution: a?.solution_body ?? null,
        };
      }
      slots.push({
        position,
        sectionName: s.name,
        subjectId: s.subject_id,
        subjectName: subjectName.get(s.subject_id) ?? "",
        type: s.question_type,
        marksCorrect: Number(s.marks_correct),
        marksWrong: Number(s.marks_wrong),
        question,
      });
    }
  }

  const imageUrls: Record<string, string> = {};
  if (opts.signImages) {
    const paths = new Set<string>();
    for (const s of slots) {
      if (s.question?.imagePath) paths.add(s.question.imagePath);
      if (s.question) for (const l of LABELS) {
        const p = s.question.options[l].imagePath;
        if (p) paths.add(p);
      }
    }
    if (paths.size) {
      const { data } = await supabase.storage.from(IMAGE_BUCKET).createSignedUrls([...paths], 3600);
      for (const d of data ?? []) if (d.path && d.signedUrl) imageUrls[d.path] = d.signedUrl;
    }
  }

  return {
    paper: {
      id: t.id,
      code: t.code ?? null,
      title: t.title,
      type: t.type,
      status: t.status,
      scheduledDate: t.scheduled_date ?? null,
      durationMin: t.duration_min,
      chapterIds: (tcs ?? []).map((r) => r.chapter_id as string),
    },
    slots,
    imageUrls,
  };
}

export type ChapterOption = { id: string; subjectId: string; name: string };
export type TopicOption = { id: string; chapterId: string; name: string };

export async function loadSyllabus(supabase: SupabaseClient) {
  const [{ data: chapters }, { data: topics }, { data: subjects }] = await Promise.all([
    supabase.from("chapters").select("id, subject_id, name, sort_order").order("sort_order").order("name"),
    supabase.from("topics").select("id, chapter_id, name, sort_order").order("sort_order").order("name"),
    supabase.from("subjects").select("id, name, sort_order").order("sort_order"),
  ]);
  return {
    subjects: (subjects ?? []).map((s) => ({ id: s.id as string, name: s.name as string })),
    chapters: (chapters ?? []).map(
      (c): ChapterOption => ({ id: c.id, subjectId: c.subject_id, name: c.name }),
    ),
    topics: (topics ?? []).map((t): TopicOption => ({ id: t.id, chapterId: t.chapter_id, name: t.name })),
  };
}

export function formatDate(d: string | null) {
  if (!d) return "";
  return new Date(d + "T00:00:00+05:30").toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", weekday: "short", timeZone: "Asia/Kolkata",
  });
}
