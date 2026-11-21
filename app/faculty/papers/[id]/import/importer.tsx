"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { IMAGE_BUCKET } from "@/lib/papers";
import {
  autoSettings, buildQuestions, columnBounds, detectCuts, parseAnswerKey, toOption,
  type Cut, type Settings,
} from "@/lib/splitter/detect";
import { loadFiles, renderQuestion, type LoadedPage } from "@/lib/splitter/browser";
import { saveQuestion } from "../../actions";

export type SlotInfo = {
  position: number;
  subjectName: string;
  sectionName: string;
  type: "mcq" | "numerical";
  filled: boolean;
};

type SaveFn = (position: number, blob: Blob, answer: string, type: "mcq" | "numerical") => Promise<string | null>;

type Step = "upload" | "mark" | "answers" | "saving" | "done";

const DEFAULT_SETTINGS: Settings = { columns: 1, split: 0.5, marginTop: 0.03, marginBottom: 0.04, excluded: [] };

export function Importer({
  testId, paperCode, slots, save,
}: {
  testId: string;
  paperCode: string;
  slots: SlotInfo[];
  save?: SaveFn; // replaced in tests
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("upload");
  const [pages, setPages] = useState<LoadedPage[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [cuts, setCuts] = useState<Cut[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [crops, setCrops] = useState<(string | null)[]>([]);
  const blobs = useRef<(Blob | null)[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [keyText, setKeyText] = useState("");
  const [saveLog, setSaveLog] = useState<{ position: number; error: string | null }[]>([]);
  const manualId = useRef(0);

  // Subjects in paper order, with their slots.
  const subjects = useMemo(() => {
    const out: { name: string; slots: SlotInfo[] }[] = [];
    for (const s of slots) {
      const last = out.at(-1);
      if (last && last.name === s.subjectName) last.slots.push(s);
      else out.push({ name: s.subjectName, slots: [s] });
    }
    return out;
  }, [slots]);

  const questions = useMemo(() => buildQuestions(pages, cuts, settings), [pages, cuts, settings]);
  const numberOfCut = useMemo(() => new Map(questions.map((q, i) => [q.cutId, i + 1])), [questions]);

  const defaultRanges = () => {
    let start = 1;
    return Object.fromEntries(
      subjects.map((s) => {
        const r = { from: start, to: start + s.slots.length - 1 };
        start += s.slots.length;
        return [s.name, r];
      }),
    ) as Record<string, { from: number; to: number }>;
  };
  const [ranges, setRanges] = useState<Record<string, { from: number; to: number }>>(defaultRanges);

  // File question number (1-based) -> paper slot, per the subject ranges.
  const mapping = useMemo(() => {
    const out: { fileQ: number; slot: SlotInfo }[] = [];
    const problems: string[] = [];
    const used = new Set<number>();
    for (const s of subjects) {
      const r = ranges[s.name];
      const count = r ? r.to - r.from + 1 : 0;
      if (!r || r.from < 1 || r.to > questions.length || count < 1) {
        problems.push(`${s.name}: choose a range between 1 and ${questions.length}.`);
        continue;
      }
      if (count !== s.slots.length) {
        problems.push(`${s.name}: Q${r.from} to Q${r.to} is ${count} questions; the paper needs ${s.slots.length}.`);
        continue;
      }
      for (let k = 0; k < count; k++) {
        const q = r.from + k;
        if (used.has(q)) problems.push(`Q${q} is in two subjects.`);
        used.add(q);
        out.push({ fileQ: q, slot: s.slots[k] });
      }
    }
    return { rows: out, problems: [...new Set(problems)] };
  }, [subjects, ranges, questions.length]);

  async function onFiles(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (!files.length) return;
    setError(null);
    if (files.some((f) => /\.docx?$/i.test(f.name))) {
      setError("Word files cannot be split directly. In Word choose File → Save As → PDF, then upload that PDF.");
      return;
    }
    if (files.reduce((s, f) => s + f.size, 0) > 60 * 1024 * 1024) {
      setError("These files are larger than 60 MB in total. Please upload fewer pages at a time.");
      return;
    }
    try {
      setBusy("Starting…");
      const loaded = await loadFiles(files, setBusy);
      const auto = autoSettings(loaded, slots.length);
      setPages(loaded);
      setSettings(auto.settings);
      setCuts(auto.cuts);
      setRanges(defaultRanges());
      setStep("mark");
    } catch (e) {
      setError(e instanceof Error ? e.message : "That file could not be read.");
    } finally {
      setBusy(null);
    }
  }

  function changeSettings(patch: Partial<Settings>) {
    const s = { ...settings, ...patch };
    setSettings(s);
    setCuts(detectCuts(pages, s, slots.length));
  }

  function addCut(pi: number, e: React.MouseEvent<HTMLDivElement>) {
    const page = pages[pi];
    if (settings.excluded.includes(pi)) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width;
    const fy = (e.clientY - rect.top) / rect.height;
    if (fy < settings.marginTop || fy > 1 - settings.marginBottom) return;
    const x = fx * page.width;
    const col = columnBounds(page, settings).findIndex(([a, b]) => x >= a && x < b);
    manualId.current += 1;
    setCuts((c) => [...c, { id: `m${manualId.current}`, page: pi, col: Math.max(0, col), y: Math.round(fy * page.height), auto: false }]);
  }

  async function goToAnswers() {
    if (mapping.problems.length) return;
    setBusy("Cutting out the questions…");
    for (const u of crops) if (u) URL.revokeObjectURL(u);
    const out: (string | null)[] = [];
    const bl: (Blob | null)[] = [];
    for (const [i, q] of questions.entries()) {
      if (i % 5 === 0) setBusy(`Cutting out question ${i + 1} of ${questions.length}…`);
      const b = await renderQuestion(pages, q.pieces);
      bl.push(b);
      out.push(b ? URL.createObjectURL(b) : null);
    }
    blobs.current = bl;
    setCrops(out);
    setBusy(null);
    setStep("answers");
    window.scrollTo({ top: 0 });
  }

  function applyKey() {
    const key = parseAnswerKey(keyText);
    const next = { ...answers };
    let applied = 0;
    for (const { fileQ, slot } of mapping.rows) {
      const v = key.get(fileQ);
      if (v === undefined) continue;
      if (slot.type === "mcq") {
        const o = toOption(v);
        if (o) { next[fileQ] = o; applied++; }
      } else if (/^-?\d+(\.\d+)?$/.test(v)) {
        next[fileQ] = v; applied++;
      }
    }
    setAnswers(next);
    setError(applied ? null : "No answers could be read. Write them like: 1-B, 2-C, 21-4.5");
  }

  const missing = mapping.rows.filter(({ fileQ }) => !answers[fileQ]);
  const blank = mapping.rows.filter(({ fileQ }) => !crops[fileQ - 1]);
  const replacing = mapping.rows.filter(({ slot }) => slot.filled).length;

  const defaultSave: SaveFn = async (position, blob, answer, type) => {
    const path = `${testId}/import-${Date.now()}-q${String(position).padStart(2, "0")}.png`;
    const { error } = await createClient().storage.from(IMAGE_BUCKET).upload(path, blob, { contentType: "image/png" });
    if (error) return "The picture could not be uploaded.";
    const empty = { body: "", image_path: null };
    const r = await saveQuestion(testId, position, {
      body: "",
      image_path: path,
      options: { A: empty, B: empty, C: empty, D: empty },
      correct_option: type === "mcq" ? answer : null,
      numeric_value: type === "numerical" ? answer : "",
      numeric_tolerance: "",
      chapter_id: null,
      topic_id: null,
      solution_body: "",
    });
    return r.error;
  };

  async function saveAll() {
    if (missing.length || blank.length) return;
    setStep("saving");
    const log: { position: number; error: string | null }[] = [];
    for (const [i, { fileQ, slot }] of mapping.rows.entries()) {
      setBusy(`Saving question ${i + 1} of ${mapping.rows.length}…`);
      const err = await (save ?? defaultSave)(slot.position, blobs.current[fileQ - 1]!, answers[fileQ], slot.type);
      log.push({ position: slot.position, error: err });
      setSaveLog([...log]);
    }
    setBusy(null);
    setStep("done");
    router.refresh();
  }

  // ---------------------------------------------------------------- views

  if (step === "upload") {
    return (
      <div className="space-y-4">
        <section className="card space-y-4">
          <h2 className="font-semibold text-slate-900">1. Upload the question paper</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
            <li><b>Best:</b> a PDF made from Word or a typesetting tool (not a scan).</li>
            <li><b>Also works:</b> a scanned PDF, or photos of the pages (JPG or PNG; select them all at once, named in page order).</li>
            <li><b>Word file:</b> in Word choose File → Save As → PDF, then upload the PDF.</li>
          </ul>
          <label className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-10 text-center ${busy ? "border-slate-200 bg-slate-50" : "border-slate-300 hover:border-brand-500 hover:bg-brand-50"}`}>
            <span className="text-lg font-semibold text-slate-800">{busy ?? "Choose PDF or photos"}</span>
            <span className="text-sm text-slate-500">PDF, JPG or PNG</span>
            <input type="file" multiple disabled={Boolean(busy)} className="sr-only"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,application/pdf,image/png,image/jpeg"
              onChange={(e) => { void onFiles(e.target.files); e.target.value = ""; }} />
          </label>
          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </section>
      </div>
    );
  }

  if (step === "mark") {
    const total = slots.length;
    return (
      <div className="space-y-4">
        <section className="card space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold text-slate-900">2. Check where each question starts</h2>
            <span className={`rounded-full px-3 py-1 text-sm font-semibold ${questions.length === total ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-900"}`}>
              {questions.length} questions found{questions.length !== total && ` (paper needs ${total})`}
            </span>
          </div>
          <p className="text-sm text-slate-600">
            Each blue line marks the start of a question. <b>Click on a page</b> to add a line where a
            question starts; click <b>×</b> on a line to remove it. Leave out pages that are not
            questions (cover, instructions, answer key).
          </p>
          <div className="flex flex-wrap items-end gap-4 text-sm">
            <label className="flex items-center gap-2">
              Layout
              <select className="rounded-md border border-slate-300 px-2 py-1.5" value={settings.columns}
                onChange={(e) => changeSettings({ columns: Number(e.target.value) as 1 | 2 })}>
                <option value={1}>One column</option>
                <option value={2}>Two columns</option>
              </select>
            </label>
            <label className="flex items-center gap-2">
              Ignore top
              <input type="number" min={0} max={30} className="w-16 rounded-md border border-slate-300 px-2 py-1.5"
                value={Math.round(settings.marginTop * 100)}
                onChange={(e) => changeSettings({ marginTop: Math.min(30, Math.max(0, Number(e.target.value) || 0)) / 100 })} />%
            </label>
            <label className="flex items-center gap-2">
              Ignore bottom
              <input type="number" min={0} max={30} className="w-16 rounded-md border border-slate-300 px-2 py-1.5"
                value={Math.round(settings.marginBottom * 100)}
                onChange={(e) => changeSettings({ marginBottom: Math.min(30, Math.max(0, Number(e.target.value) || 0)) / 100 })} />%
            </label>
            <button type="button" className="btn-outline px-3 py-1.5 text-sm" onClick={() => changeSettings({})}>
              Find questions again
            </button>
          </div>
          <p className="text-xs text-slate-500">
            Changing these settings finds the questions again and clears lines you added by hand.
            Use &quot;Ignore top/bottom&quot; to leave out a heading or page number repeated on every page.
          </p>
        </section>

        <div className="space-y-6">
          {pages.map((page, pi) => {
            const excluded = settings.excluded.includes(pi);
            const cols = columnBounds(page, settings);
            return (
              <div key={pi} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-slate-800">
                    Page {pi + 1}
                    {page.source === "ocr" && <span className="ml-2 font-normal text-slate-500">(read by text recognition)</span>}
                    {page.source === "none" && <span className="ml-2 font-normal text-amber-700">(no text found: mark questions by hand)</span>}
                  </span>
                  <label className="flex items-center gap-2 text-slate-700">
                    <input type="checkbox" checked={excluded}
                      onChange={(e) => changeSettings({
                        excluded: e.target.checked ? [...settings.excluded, pi] : settings.excluded.filter((x) => x !== pi),
                      })} />
                    Leave out this page
                  </label>
                </div>
                <div className="relative mx-auto max-w-3xl cursor-crosshair select-none border border-slate-300 bg-white shadow-sm"
                  onClick={(e) => addCut(pi, e)}>
                  <img src={page.preview} alt={`Page ${pi + 1}`} className="block w-full" draggable={false} />
                  <div className="pointer-events-none absolute inset-x-0 top-0 bg-slate-500/20" style={{ height: `${settings.marginTop * 100}%` }} />
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-slate-500/20" style={{ height: `${settings.marginBottom * 100}%` }} />
                  {settings.columns === 2 && (
                    <div className="pointer-events-none absolute inset-y-0 border-l-2 border-dashed border-orange-400"
                      style={{ left: `${(cols[1][0] / page.width) * 100}%` }} />
                  )}
                  {!excluded && cuts.filter((c) => c.page === pi).map((c) => {
                    const [x0, x1] = cols[c.col] ?? cols[0];
                    const n = numberOfCut.get(c.id);
                    return (
                      <div key={c.id} className="absolute border-t-2 border-blue-600"
                        style={{ top: `${(c.y / page.height) * 100}%`, left: `${(x0 / page.width) * 100}%`, width: `${((x1 - x0) / page.width) * 100}%` }}>
                        <span className="absolute -top-3 left-0 rounded bg-blue-600 px-1.5 text-xs font-bold text-white">
                          Q{n ?? "?"}
                        </span>
                        <button type="button" aria-label="Remove this line"
                          className="absolute -top-3 right-0 grid h-6 w-6 place-items-center rounded-full bg-red-600 text-sm font-bold text-white hover:bg-red-700"
                          onClick={(e) => { e.stopPropagation(); setCuts((all) => all.filter((x) => x.id !== c.id)); }}>
                          ×
                        </button>
                      </div>
                    );
                  })}
                  {excluded && (
                    <div className="pointer-events-none absolute inset-0 grid place-items-center bg-white/70 text-lg font-semibold text-slate-600">
                      Left out
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <section className="card sticky bottom-2 z-10 space-y-3 shadow-lg">
          <h2 className="font-semibold text-slate-900">3. Which questions belong to which subject?</h2>
          <p className="text-sm text-slate-600">
            Numbers count from the first question in the file ({questions.length} found). Within a
            subject, the first questions fill Section A (multiple choice) and the rest Section B (numerical).
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {subjects.map((s) => {
              const r = ranges[s.name] ?? { from: 1, to: 1 };
              const a = s.slots.filter((x) => x.type === "mcq").length;
              return (
                <div key={s.name} className="rounded-lg border border-slate-200 p-3">
                  <p className="font-semibold text-slate-800">{s.name}</p>
                  <p className="text-xs text-slate-500">{s.slots.length} questions: {a} multiple choice, {s.slots.length - a} numerical</p>
                  <div className="mt-2 flex items-center gap-2 text-sm">
                    Q
                    <input type="number" min={1} className="w-16 rounded-md border border-slate-300 px-2 py-1" value={r.from}
                      onChange={(e) => setRanges({ ...ranges, [s.name]: { ...r, from: Number(e.target.value) } })} />
                    to Q
                    <input type="number" min={1} className="w-16 rounded-md border border-slate-300 px-2 py-1" value={r.to}
                      onChange={(e) => setRanges({ ...ranges, [s.name]: { ...r, to: Number(e.target.value) } })} />
                  </div>
                </div>
              );
            })}
          </div>
          {mapping.problems.length > 0 && (
            <ul className="list-disc space-y-0.5 rounded-lg bg-amber-50 py-2 pl-8 pr-3 text-sm text-amber-900">
              {mapping.problems.map((p) => <li key={p}>{p}</li>)}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn" disabled={mapping.problems.length > 0 || Boolean(busy)} onClick={() => void goToAnswers()}>
              {busy ?? "Next: answer key"}
            </button>
            <button type="button" className="btn-outline" onClick={() => { setStep("upload"); setPages([]); setCuts([]); }}>
              Upload a different file
            </button>
          </div>
        </section>
      </div>
    );
  }

  if (step === "answers") {
    return (
      <div className="space-y-4">
        <section className="card space-y-3">
          <h2 className="font-semibold text-slate-900">4. Answer key</h2>
          <p className="text-sm text-slate-600">
            Paste the answer key, numbered from the first question in the file. Options can be A–D
            or 1–4. Example: <code>1-B, 2-C, 3-(4), 21-4.5</code>. Write a negative answer as <code>22: -3</code>.
            You can also choose each answer below.
          </p>
          <textarea rows={4} className="field font-mono text-sm" value={keyText} onChange={(e) => setKeyText(e.target.value)}
            placeholder="1-B 2-C 3-A …" />
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn-outline" onClick={applyKey}>Fill in from the key</button>
            <span className="text-sm text-slate-600">{mapping.rows.length - missing.length} of {mapping.rows.length} answered</span>
          </div>
          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </section>

        <div className="space-y-3">
          {mapping.rows.map(({ fileQ, slot }) => (
            <div key={fileQ} className={`card space-y-2 ${!answers[fileQ] ? "border-amber-300" : ""}`}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="font-semibold text-slate-900">File Q{fileQ} → Paper Q{slot.position}</span>
                <span className="text-slate-500">{slot.subjectName} · {slot.sectionName} · {slot.type === "mcq" ? "Multiple choice" : "Numerical"}</span>
                {slot.filled && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">replaces the saved question</span>}
                <span className="ml-auto flex items-center gap-2">
                  Answer
                  {slot.type === "mcq" ? (
                    <select className="rounded-md border border-slate-300 px-2 py-1" value={answers[fileQ] ?? ""}
                      onChange={(e) => setAnswers({ ...answers, [fileQ]: e.target.value })}>
                      <option value="">–</option>
                      {["A", "B", "C", "D"].map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input inputMode="decimal" className="w-24 rounded-md border border-slate-300 px-2 py-1" value={answers[fileQ] ?? ""}
                      onChange={(e) => setAnswers({ ...answers, [fileQ]: e.target.value.trim() })} />
                  )}
                </span>
              </div>
              {crops[fileQ - 1] ? (
                <img src={crops[fileQ - 1]!} alt={`Question ${fileQ}`} className="max-h-[480px] max-w-full border border-slate-100" />
              ) : (
                <p className="text-sm text-red-700">This area is blank. Go back and check the lines.</p>
              )}
            </div>
          ))}
        </div>

        <section className="card sticky bottom-2 z-10 space-y-2 shadow-lg">
          {replacing > 0 && (
            <p className="text-sm text-amber-900">{replacing} question{replacing === 1 ? "" : "s"} already in {paperCode} will be replaced.</p>
          )}
          {missing.length > 0 && (
            <p className="text-sm text-amber-900">
              {missing.length} question{missing.length === 1 ? " has" : "s have"} no answer yet
              (file Q{missing.slice(0, 8).map((m) => m.fileQ).join(", Q")}{missing.length > 8 ? "…" : ""}).
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn" disabled={missing.length > 0 || blank.length > 0} onClick={() => void saveAll()}>
              Save {mapping.rows.length} questions into {paperCode}
            </button>
            <button type="button" className="btn-outline" onClick={() => setStep("mark")}>Back to the pages</button>
          </div>
        </section>
      </div>
    );
  }

  const failed = saveLog.filter((l) => l.error);
  return (
    <section className="card space-y-3">
      <h2 className="font-semibold text-slate-900">{step === "saving" ? "Saving…" : "Done"}</h2>
      <p className="text-slate-700">
        {busy ?? `${saveLog.length - failed.length} of ${saveLog.length} questions saved into ${paperCode}.`}
      </p>
      {failed.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-sm text-red-700">
          {failed.map((f) => <li key={f.position}>Paper Q{f.position}: {f.error}</li>)}
        </ul>
      )}
      {step === "done" && (
        <p className="text-sm text-slate-600">
          The questions are saved as drafts. Open the paper to set chapters, then confirm each question
          before publishing.
        </p>
      )}
      {step === "done" && (
        <Link href={`/faculty/papers/${testId}`} className="btn">Open {paperCode}</Link>
      )}
    </section>
  );
}
