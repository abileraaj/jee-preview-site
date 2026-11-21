"use client";
/* eslint-disable @next/next/no-img-element */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { StudentPreview } from "@/components/student-preview";
import {
  IMAGE_BUCKET, LABELS, type ChapterOption, type Label, type Slot, type TopicOption,
} from "@/lib/papers";
import { reviewQuestion, saveQuestion } from "../actions";

type Img = { path: string | null; url: string | null };
type Draft = {
  body: string;
  image: Img;
  options: Record<Label, { body: string; image: Img; showImage: boolean }>;
  correct: Label | "";
  numericValue: string;
  numericTolerance: string;
  chapterId: string;
  topicId: string;
  solution: string;
};

const MAX_BYTES = 2 * 1024 * 1024;

function initialDraft(slot: Slot, urls: Record<string, string>): Draft {
  const q = slot.question;
  const img = (path: string | null | undefined): Img => ({ path: path ?? null, url: path ? (urls[path] ?? null) : null });
  return {
    body: q?.body ?? "",
    image: img(q?.imagePath),
    options: Object.fromEntries(
      LABELS.map((l) => {
        const o = q?.options[l];
        return [l, { body: o?.body ?? "", image: img(o?.imagePath), showImage: Boolean(o?.imagePath) }];
      }),
    ) as Draft["options"],
    correct: q?.correctOption ?? "",
    numericValue: q?.numericValue ?? "",
    numericTolerance: q?.numericTolerance && q.numericTolerance !== "0" ? q.numericTolerance : "",
    chapterId: q?.chapterId ?? "",
    topicId: q?.topicId ?? "",
    solution: q?.solution ?? "",
  };
}

export function QuestionCard({
  testId, paperCode, slot, imageUrls, chapters, topics, isAdmin, locked,
}: {
  testId: string;
  paperCode: string;
  slot: Slot;
  imageUrls: Record<string, string>;
  chapters: ChapterOption[];
  topics: TopicOption[];
  isAdmin: boolean;
  locked: boolean; // published paper and the viewer is not an admin
}) {
  const router = useRouter();
  const q = slot.question;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => initialDraft(slot, imageUrls));
  const [dirty, setDirty] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [askNote, setAskNote] = useState(false);
  const [pending, startTransition] = useTransition();

  const change = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
    setError(null);
  };
  const changeOption = (l: Label, patch: Partial<Draft["options"][Label]>) =>
    change({ options: { ...draft.options, [l]: { ...draft.options[l], ...patch } } });

  async function upload(file: File, field: string): Promise<Img | null> {
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      setError("Pictures must be PNG or JPG files.");
      return null;
    }
    if (file.size > MAX_BYTES) {
      setError("That picture is larger than 2 MB. Please use a smaller one.");
      return null;
    }
    setUploading(true);
    setError(null);
    const ext = file.type === "image/png" ? "png" : "jpg";
    const path = `${testId}/q${String(slot.position).padStart(2, "0")}-${field}-${Date.now()}.${ext}`;
    const { error } = await createClient().storage.from(IMAGE_BUCKET).upload(path, file, { contentType: file.type });
    setUploading(false);
    if (error) {
      setError("The picture could not be uploaded. Please try again.");
      return null;
    }
    return { path, url: URL.createObjectURL(file) };
  }

  function save() {
    startTransition(async () => {
      const result = await saveQuestion(testId, slot.position, {
        body: draft.body,
        image_path: draft.image.path,
        options: Object.fromEntries(
          LABELS.map((l) => [l, { body: draft.options[l].body, image_path: draft.options[l].image.path }]),
        ),
        correct_option: draft.correct || null,
        numeric_value: draft.numericValue,
        numeric_tolerance: draft.numericTolerance,
        chapter_id: draft.chapterId || null,
        topic_id: draft.topicId || null,
        solution_body: draft.solution,
      });
      if (result.error) return setError(result.error);
      setDirty(false);
      setShowPreview(true);
      router.refresh();
    });
  }

  function review(decision: "reviewed" | "rejected" | "draft") {
    if (!q) return;
    startTransition(async () => {
      const result = await reviewQuestion(testId, q.id, decision, note);
      if (result.error) return setError(result.error);
      setAskNote(false);
      setNote("");
      router.refresh();
    });
  }

  const confirmed = q?.status === "reviewed" || q?.status === "published";
  const status = !q
    ? { text: "Empty", cls: "bg-slate-100 text-slate-600" }
    : confirmed
      ? { text: "✓ Confirmed", cls: "bg-green-100 text-green-800" }
      : q.status === "rejected"
        ? { text: "✗ Needs correction", cls: "bg-red-100 text-red-800" }
        : { text: "Saved, awaiting admin", cls: "bg-amber-100 text-amber-800" };

  const subjectChapters = chapters.filter((c) => c.subjectId === slot.subjectId);
  const chapterTopics = topics.filter((t) => t.chapterId === draft.chapterId);
  const busy = pending || uploading;
  const questionId = q?.code ?? `${paperCode}-Q${String(slot.position).padStart(2, "0")}`;

  const preview = (
    <StudentPreview
      q={{
        position: slot.position, subjectName: slot.subjectName, sectionName: slot.sectionName,
        type: slot.type, marksCorrect: slot.marksCorrect, marksWrong: slot.marksWrong,
        body: draft.body, imageUrl: draft.image.url,
        options: Object.fromEntries(
          LABELS.map((l) => [l, { body: draft.options[l].body, imageUrl: draft.options[l].image.url }]),
        ) as Record<Label, { body: string; imageUrl: string | null }>,
      }}
    />
  );

  return (
    <section id={`q${slot.position}`} className="card scroll-mt-28 p-0">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left">
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold ${
          confirmed ? "bg-green-600 text-white" : q ? "bg-amber-400 text-slate-900" : "bg-slate-200 text-slate-700"}`}>
          {confirmed ? "✓" : slot.position}
        </span>
        <span className="font-semibold text-slate-900">Question {slot.position}</span>
        <span className="text-sm text-slate-500">
          {slot.sectionName} · {slot.type === "mcq" ? "Multiple choice" : "Numerical"} · ID {questionId}
        </span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.cls}`}>{status.text}</span>
        {dirty && <span className="text-xs font-medium text-brand-700">Unsaved changes</span>}
        <span className="ml-auto text-sm font-medium text-brand-700">{open ? "Close" : q ? "Open" : "Add"}</span>
      </button>

      {!open && q && (
        <p className="truncate border-t border-slate-100 px-4 py-2 text-sm text-slate-600">
          {q.body || "(picture question)"}
        </p>
      )}

      {open && (
        <div className="space-y-5 border-t border-slate-200 p-4">
          {q?.status === "rejected" && q.reviewNote && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
              Admin&apos;s note: {q.reviewNote}
            </p>
          )}

          <fieldset disabled={locked || busy} className="space-y-5">
            <div>
              <label className="label" htmlFor={`body-${slot.position}`}>Question</label>
              <textarea id={`body-${slot.position}`} rows={4} className="field"
                placeholder="Type the question here. Leave empty if the whole question is a picture."
                value={draft.body} onChange={(e) => change({ body: e.target.value })} />
              <ImagePicker label="Picture for the question" image={draft.image}
                onPick={async (f) => { const r = await upload(f, "question"); if (r) change({ image: r }); }}
                onRemove={() => change({ image: { path: null, url: null } })} />
            </div>

            {slot.type === "mcq" ? (
              <div>
                <p className="label">Options (select the correct one)</p>
                <div className="space-y-3">
                  {LABELS.map((l) => {
                    const o = draft.options[l];
                    return (
                      <div key={l} className={`rounded-lg border p-3 ${draft.correct === l ? "border-green-500 bg-green-50" : "border-slate-200"}`}>
                        <div className="flex items-center gap-3">
                          <label className="flex items-center gap-2 font-semibold text-slate-800">
                            <input type="radio" name={`correct-${slot.position}`} checked={draft.correct === l}
                              onChange={() => change({ correct: l })} />
                            {l}
                          </label>
                          <input className="field" placeholder={`Option ${l}`} value={o.body}
                            onChange={(e) => changeOption(l, { body: e.target.value })} />
                          <button type="button" onClick={() => changeOption(l, { showImage: !o.showImage })}
                            className={`shrink-0 rounded-lg border px-3 py-2 text-sm font-medium ${
                              o.showImage ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-300 text-slate-700"}`}>
                            Picture
                          </button>
                        </div>
                        {o.showImage && (
                          <ImagePicker label={`Picture for option ${l}`} image={o.image}
                            onPick={async (f) => { const r = await upload(f, `option${l}`); if (r) changeOption(l, { image: r }); }}
                            onRemove={() => changeOption(l, { image: { path: null, url: null } })} />
                        )}
                      </div>
                    );
                  })}
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  If the options are already inside the question picture, leave these boxes empty and
                  just select the correct letter.
                </p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor={`num-${slot.position}`}>Correct answer (a number)</label>
                  <input id={`num-${slot.position}`} className="field" inputMode="decimal" placeholder="e.g. 4.5"
                    value={draft.numericValue} onChange={(e) => change({ numericValue: e.target.value })} />
                </div>
                <div>
                  <label className="label" htmlFor={`tol-${slot.position}`}>Allowed difference (optional)</label>
                  <input id={`tol-${slot.position}`} className="field" inputMode="decimal" placeholder="0 = exact match"
                    value={draft.numericTolerance} onChange={(e) => change({ numericTolerance: e.target.value })} />
                </div>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor={`ch-${slot.position}`}>Chapter</label>
                <select id={`ch-${slot.position}`} className="field" value={draft.chapterId}
                  onChange={(e) => change({ chapterId: e.target.value, topicId: "" })}>
                  <option value="">{subjectChapters.length ? "Choose a chapter" : "No chapters uploaded yet"}</option>
                  {subjectChapters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor={`tp-${slot.position}`}>Topic</label>
                <select id={`tp-${slot.position}`} className="field" value={draft.topicId}
                  disabled={!draft.chapterId} onChange={(e) => change({ topicId: e.target.value })}>
                  <option value="">{chapterTopics.length ? "Choose a topic" : "No topics"}</option>
                  {chapterTopics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="label" htmlFor={`sol-${slot.position}`}>Solution (shown to students after the test)</label>
              <textarea id={`sol-${slot.position}`} rows={3} className="field" value={draft.solution}
                onChange={(e) => change({ solution: e.target.value })} />
            </div>
          </fieldset>

          {showPreview && (
            <div>
              <p className="label">How the student will see it</p>
              {preview}
            </div>
          )}

          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn-outline" onClick={() => setShowPreview((p) => !p)}>
              {showPreview ? "Hide preview" : "Preview"}
            </button>
            {!locked && (
              <button type="button" className="btn" disabled={busy || (!dirty && Boolean(q))} onClick={save}>
                {uploading ? "Uploading picture…" : pending ? "Saving…" : q && !dirty ? "Saved" : "Save question"}
              </button>
            )}
            {isAdmin && q && !dirty && q.status !== "published" && (
              <>
                {!confirmed && (
                  <button type="button" disabled={busy} onClick={() => review("reviewed")}
                    className="btn bg-green-600 hover:bg-green-700">✓ Confirm question</button>
                )}
                {confirmed && (
                  <button type="button" disabled={busy} onClick={() => review("draft")} className="btn-outline">
                    Remove confirmation
                  </button>
                )}
                {q.status !== "rejected" && (
                  <button type="button" disabled={busy} onClick={() => setAskNote((a) => !a)}
                    className="btn-outline border-red-300 text-red-700">✗ Needs correction</button>
                )}
              </>
            )}
          </div>
          {isAdmin && dirty && q && (
            <p className="text-sm text-slate-500">Save your changes first, then confirm the question.</p>
          )}
          {askNote && (
            <div className="flex flex-wrap gap-2">
              <input className="field max-w-md" placeholder="What needs to be corrected?" value={note}
                onChange={(e) => setNote(e.target.value)} />
              <button type="button" disabled={busy} onClick={() => review("rejected")}
                className="btn bg-red-600 hover:bg-red-700">Send back</button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function ImagePicker({
  label, image, onPick, onRemove,
}: {
  label: string;
  image: Img;
  onPick: (file: File) => void | Promise<void>;
  onRemove: () => void;
}) {
  return (
    <div className="mt-2">
      {image.path ? (
        <div className="flex flex-wrap items-start gap-3">
          {image.url ? (
            <img src={image.url} alt={label} className="max-h-40 max-w-full rounded border border-slate-200" />
          ) : (
            <span className="text-sm text-slate-500">Picture attached</span>
          )}
          <button type="button" onClick={onRemove} className="text-sm font-medium text-red-700">Remove picture</button>
        </div>
      ) : (
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-400 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          + {label}
          <input type="file" accept="image/png,image/jpeg" className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void onPick(f);
            }} />
        </label>
      )}
    </div>
  );
}
