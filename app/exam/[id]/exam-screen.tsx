"use client";
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ExamEvent, ExamQuestion, ExamResponse, PaletteState, SaveItem } from "@/lib/exam";
import { saveResponses, submitAttempt } from "../actions";

type Saved = { sel: string | null; num: string | null; state: PaletteState };

export type ExamApi = {
  save: (items: SaveItem[], events: ExamEvent[]) => Promise<string>;
  submit: () => Promise<string>;
};

const LABELS = ["A", "B", "C", "D"];
const AUTOSAVE_MS = 15_000;

const PALETTE_STYLE: Record<PaletteState, string> = {
  not_visited: "bg-slate-100 text-slate-700 border-slate-300",
  not_answered: "bg-red-500 text-white border-red-600 rounded-b-xl",
  answered: "bg-green-600 text-white border-green-700 rounded-t-xl",
  marked: "bg-purple-600 text-white border-purple-700 rounded-full",
  answered_marked: "bg-purple-600 text-white border-purple-700 rounded-full ring-2 ring-green-500 ring-offset-1",
};

const STATE_LABEL: Record<PaletteState, string> = {
  not_visited: "Not visited",
  not_answered: "Not answered",
  answered: "Answered",
  marked: "Marked for review",
  answered_marked: "Answered & marked for review (will be evaluated)",
};

function cleanNumber(v: string) {
  let s = v.replace(/[^0-9.\-]/g, "");
  s = s.replace(/(?!^)-/g, ""); // minus only at the start
  const dot = s.indexOf(".");
  if (dot >= 0) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, "");
  return s.slice(0, 12);
}

const hasAnswer = (s: Pick<Saved, "sel" | "num">) => Boolean(s.sel) || (s.num !== null && s.num !== "" && s.num !== "-" && s.num !== ".");

function initialAnswers(questions: ExamQuestion[], responses: ExamResponse[]) {
  const byId = new Map(responses.map((r) => [r.question_id, r]));
  const out: Record<string, Saved> = {};
  for (const q of questions) {
    const r = byId.get(q.question_id);
    out[q.question_id] = {
      sel: r?.selected_option ?? null,
      num: r?.numeric_answer === null || r?.numeric_answer === undefined ? null : String(r.numeric_answer),
      state: r?.palette_state ?? "not_visited",
    };
  }
  return out;
}

function formatClock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function ExamScreen({
  attemptId, testCode, testTitle, studentName, isTrial, deadlineMs, serverNowMs,
  questions, responses, imageUrls, api,
}: {
  attemptId: string;
  testCode: string;
  testTitle: string;
  studentName: string;
  isTrial: boolean;
  deadlineMs: number;
  serverNowMs: number;
  questions: ExamQuestion[];
  responses: ExamResponse[];
  imageUrls: Record<string, string>;
  api?: ExamApi; // replaced in tests
}) {
  const router = useRouter();
  const storageKey = `testnex-attempt-${attemptId}`;

  // Saved answers per question (what counts for marks). The state drives
  // the screen; the ref mirrors it so background saving sends the latest.
  const [answers, setAnswers] = useState(() => initialAnswers(questions, responses));
  const saved = useRef(answers);
  const updateSaved = useCallback((patch: Record<string, Saved>) => {
    saved.current = { ...saved.current, ...patch };
    setAnswers(saved.current);
  }, []);
  const dirty = useRef(new Set<string>());
  const pendingTime = useRef(new Map<string, { ms: number; visits: number }>());
  const events = useRef<ExamEvent[]>([]);
  const inflight = useRef<Promise<string | null> | null>(null);
  const clock = useRef<{ qid: string; since: number } | null>(null);
  const finished = useRef(false);

  const subjects = useMemo(() => [...new Set(questions.map((q) => q.subject))], [questions]);
  const [idx, setIdx] = useState(() =>
    Math.max(0, questions.findIndex((x) => answers[x.question_id]?.state === "not_visited")),
  );
  const q = questions[idx];
  const [draftSel, setDraftSel] = useState<string | null>(null);
  const [draftNum, setDraftNum] = useState("");
  const [status, setStatus] = useState<"saved" | "saving" | "offline">("saved");
  const [showPalette, setShowPalette] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isFull, setIsFull] = useState(false);

  // Difference between the server's clock and this device's clock, so a
  // wrong phone clock cannot add time.
  const offset = useRef(0);
  useEffect(() => {
    offset.current = serverNowMs - Date.now();
  }, [serverNowMs]);
  const [left, setLeft] = useState(deadlineMs - serverNowMs);

  const doSave: ExamApi["save"] = useCallback(
    (items, evs) => (api ? api.save(items, evs) : saveResponses(attemptId, items, evs)),
    [api, attemptId],
  );
  const doSubmit: ExamApi["submit"] = useCallback(
    () => (api ? api.submit() : submitAttempt(attemptId)),
    [api, attemptId],
  );

  // ---- local backup (survives a refresh while offline) -----------------
  const backup = useCallback(() => {
    try {
      const pending = [...dirty.current].map((id) => [id, saved.current[id]]);
      localStorage.setItem(storageKey, JSON.stringify({ pending }));
    } catch {
      /* storage unavailable: the server copy is still there */
    }
  }, [storageKey]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const { pending } = JSON.parse(raw) as { pending: [string, Saved][] };
      const patch: Record<string, Saved> = {};
      for (const [id, s] of pending ?? []) {
        if (saved.current[id]) {
          patch[id] = s;
          dirty.current.add(id);
        }
      }
      if (Object.keys(patch).length) updateSaved(patch);
    } catch {
      /* ignore a damaged backup */
    }
  }, [storageKey, updateSaved]);

  // ---- time on each question ---------------------------------------------
  const stopClock = useCallback(() => {
    const c = clock.current;
    if (!c) return;
    const p = pendingTime.current.get(c.qid) ?? { ms: 0, visits: 0 };
    p.ms += Math.max(0, performance.now() - c.since);
    pendingTime.current.set(c.qid, p);
    clock.current = null;
  }, []);
  const startClock = useCallback((qid: string) => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    clock.current = { qid, since: performance.now() };
  }, []);

  // ---- saving --------------------------------------------------------------
  const finishAndLeave = useCallback(() => {
    finished.current = true;
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
    router.replace(`/results/${attemptId}`);
  }, [attemptId, router, storageKey]);

  const flush = useCallback(async (): Promise<string | null> => {
    if (inflight.current) await inflight.current;
    const current = clock.current?.qid;
    stopClock();
    if (current && !finished.current) startClock(current);

    const ids = new Set([...dirty.current, ...pendingTime.current.keys()]);
    const evs = events.current.splice(0);
    if (!ids.size && !evs.length) return "ok";
    const sentTime = new Map(pendingTime.current);
    const sentDirty = new Set(dirty.current);
    const items: SaveItem[] = [...ids].map((id) => {
      const s = saved.current[id];
      const t = sentTime.get(id);
      return {
        question_id: id,
        selected_option: s.sel,
        numeric_answer: s.num,
        palette_state: s.state,
        add_ms: Math.round(t?.ms ?? 0),
        add_visits: t?.visits ?? 0,
      };
    });
    pendingTime.current.clear();
    dirty.current.clear();
    setStatus("saving");

    const run = (async () => {
      try {
        const result = await doSave(items, evs);
        setStatus(dirty.current.size ? "saving" : "saved");
        backup();
        return result;
      } catch {
        // Put everything back to send again later.
        for (const [id, t] of sentTime) {
          const p = pendingTime.current.get(id) ?? { ms: 0, visits: 0 };
          pendingTime.current.set(id, { ms: p.ms + t.ms, visits: p.visits + t.visits });
        }
        for (const id of sentDirty) dirty.current.add(id);
        events.current.unshift(...evs);
        setStatus("offline");
        backup();
        return null;
      }
    })();
    inflight.current = run;
    const result = await run;
    inflight.current = null;
    if (result && result !== "ok" && !finished.current) finishAndLeave();
    return result;
  }, [backup, doSave, finishAndLeave, startClock, stopClock]);

  const submitRef = useRef<(auto: boolean) => Promise<void>>(async () => {});
  const submit = useCallback(async (auto: boolean) => {
    if (submitting || finished.current) return;
    setSubmitting(true);
    setSubmitError(null);
    stopClock();
    for (let i = 0; i < 3; i++) {
      const r = await flush();
      if (r !== null) break;
      await new Promise((res) => setTimeout(res, 1500));
    }
    try {
      await doSubmit();
      finishAndLeave();
    } catch {
      setSubmitting(false);
      setSubmitError(
        auto
          ? "Time is up, but your answers could not be sent. Check the internet connection; it will retry."
          : "Could not submit. Check your internet connection and try again.",
      );
      if (auto) setTimeout(() => void submitRef.current(true), 5000);
    }
  }, [doSubmit, finishAndLeave, flush, stopClock, submitting]);
  useEffect(() => {
    submitRef.current = submit;
  }, [submit]);

  // ---- entering a question ------------------------------------------------
  const entered = useRef<number | null>(null);
  useEffect(() => {
    if (!q) return;
    const s = saved.current[q.question_id];
    setDraftSel(s.sel);
    setDraftNum(s.num ?? "");
    if (entered.current !== idx) {
      entered.current = idx;
      const p = pendingTime.current.get(q.question_id) ?? { ms: 0, visits: 0 };
      p.visits += 1;
      pendingTime.current.set(q.question_id, p);
      events.current.push({ kind: "enter", question_id: q.question_id });
      if (s.state === "not_visited") {
        dirty.current.add(q.question_id);
        updateSaved({ [q.question_id]: { ...s, state: "not_answered" } });
      }
    }
    startClock(q.question_id);
    return () => stopClock();
  }, [idx, q, startClock, stopClock, updateSaved]);

  // ---- timer, autosave, tab switching, full screen --------------------------
  useEffect(() => {
    const t = setInterval(() => {
      const remaining = deadlineMs - (Date.now() + offset.current);
      setLeft(remaining);
      if (remaining <= 0 && !finished.current) void submit(true);
    }, 1000);
    return () => clearInterval(t);
  }, [deadlineMs, submit]);

  useEffect(() => {
    const t = setInterval(() => void flush(), AUTOSAVE_MS);
    return () => clearInterval(t);
  }, [flush]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        stopClock();
        events.current.push({ kind: "tab_hidden", question_id: q?.question_id });
        void flush();
      } else if (q && !finished.current) {
        events.current.push({ kind: "tab_visible", question_id: q.question_id });
        startClock(q.question_id);
      }
    };
    const onFull = () => {
      const full = Boolean(document.fullscreenElement);
      setIsFull(full);
      events.current.push({ kind: full ? "fullscreen_on" : "fullscreen_off" });
    };
    const onLeave = (e: BeforeUnloadEvent) => {
      if (finished.current) return;
      backup();
      e.preventDefault();
    };
    document.addEventListener("visibilitychange", onVis);
    document.addEventListener("fullscreenchange", onFull);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      document.removeEventListener("fullscreenchange", onFull);
      window.removeEventListener("beforeunload", onLeave);
    };
  }, [backup, flush, q, startClock, stopClock]);

  const warned = useRef(new Set<number>());
  useEffect(() => {
    const mins = Math.ceil(left / 60000);
    for (const w of [15, 5]) {
      if (mins <= w && left > 0 && !warned.current.has(w)) {
        warned.current.add(w);
        setNotice(`${w} minutes left.`);
      }
    }
  }, [left]);

  // ---- actions --------------------------------------------------------------
  const go = (i: number) => {
    if (i < 0 || i >= questions.length || i === idx) return;
    setIdx(i);
    setShowPalette(false);
    window.scrollTo({ top: 0 });
  };
  const next = () => go(idx + 1 < questions.length ? idx + 1 : 0);

  const commit = (state: PaletteState, answer: Pick<Saved, "sel" | "num">) => {
    dirty.current.add(q.question_id);
    updateSaved({ [q.question_id]: { ...answer, state } });
    backup();
  };

  const draft = { sel: q?.type === "mcq" ? draftSel : null, num: q?.type === "numerical" ? (draftNum === "" ? null : draftNum) : null };
  const draftValid = q?.type === "mcq" || draft.num === null || /^-?\d+(\.\d+)?$/.test(draft.num);

  const saveAndNext = () => {
    if (!draftValid) return setNotice("Enter a valid number, e.g. 12 or 4.5 or -3.");
    commit(hasAnswer(draft) ? "answered" : "not_answered", draft);
    next();
  };
  const saveAndMark = () => {
    if (!draftValid) return setNotice("Enter a valid number, e.g. 12 or 4.5 or -3.");
    commit(hasAnswer(draft) ? "answered_marked" : "marked", draft);
    next();
  };
  const markAndNext = () => {
    const s = answers[q.question_id];
    commit(hasAnswer(s) ? "answered_marked" : "marked", { sel: s.sel, num: s.num });
    next();
  };
  const clear = () => {
    setDraftSel(null);
    setDraftNum("");
    commit("not_answered", { sel: null, num: null });
  };

  const fullScreen = () => {
    document.documentElement.requestFullscreen?.().catch(() => setNotice("Full screen is not available on this device."));
  };

  // ---- view -------------------------------------------------------------------
  if (!q) {
    return <main className="p-8 text-center text-slate-700">This paper has no questions.</main>;
  }

  const counts = (list: ExamQuestion[]) => {
    const c: Record<PaletteState, number> = { not_visited: 0, not_answered: 0, answered: 0, marked: 0, answered_marked: 0 };
    for (const x of list) c[answers[x.question_id].state]++;
    return c;
  };
  const subjectQs = questions.filter((x) => x.subject === q.subject);
  const subjectCounts = counts(subjectQs);
  const low = left < 5 * 60_000;
  const optionsInPicture = q.type === "mcq" && q.options.every((o) => !o.body && !o.image_path);
  const s = answers[q.question_id];
  const changedFromSaved = q.type === "mcq" ? draftSel !== s.sel : (draftNum || null) !== s.num;

  const palette = (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-xs text-slate-700">
        {(Object.keys(STATE_LABEL) as PaletteState[]).map((k) => (
          <span key={k} className={`flex items-center gap-1.5 ${k === "answered_marked" ? "col-span-2" : ""}`}>
            <span className={`grid h-6 w-6 shrink-0 place-items-center border text-[11px] font-bold ${PALETTE_STYLE[k]}`}>
              {subjectCounts[k]}
            </span>
            {STATE_LABEL[k]}
          </span>
        ))}
      </div>
      <p className="rounded bg-blue-700 px-2 py-1 text-sm font-semibold text-white">{q.subject}</p>
      <div className="grid grid-cols-5 gap-2">
        {subjectQs.map((x) => {
          const i = questions.indexOf(x);
          const st = answers[x.question_id].state;
          return (
            <button key={x.question_id} type="button" onClick={() => go(i)}
              aria-label={`Question ${x.position}, ${STATE_LABEL[st]}`}
              className={`grid h-10 place-items-center border text-sm font-bold ${PALETTE_STYLE[st]} ${i === idx ? "outline-2 outline-offset-2 outline-blue-600" : ""}`}>
              {x.position}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-slate-300 bg-white">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-slate-900">{testCode} · {testTitle}</p>
            <p className="truncate text-xs text-slate-500">
              {studentName}{isTrial && " · Staff trial (not counted in student ranks)"}
            </p>
          </div>
          <div className={`rounded-lg px-3 py-1 text-center ${low ? "bg-red-600 text-white" : "bg-slate-900 text-white"}`}>
            <p className="text-[10px] uppercase tracking-wide opacity-80">Time left</p>
            <p className="font-mono text-lg font-bold leading-tight" aria-live="off">{formatClock(left)}</p>
          </div>
          <span className={`hidden text-xs sm:block ${status === "offline" ? "font-semibold text-red-700" : "text-slate-500"}`}>
            {status === "saved" ? "All answers saved" : status === "saving" ? "Saving…" : "No connection: answers kept, retrying"}
          </span>
          {!isFull && (
            <button type="button" onClick={fullScreen} className="hidden rounded-md border border-slate-300 px-2 py-1 text-xs font-medium md:block">
              Full screen
            </button>
          )}
          <button type="button" onClick={() => setShowPalette(true)}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold lg:hidden">
            Questions
          </button>
        </div>
        {/* Subject tabs */}
        <nav className="flex gap-1 overflow-x-auto border-t border-slate-200 bg-slate-100 px-2 pt-1">
          {subjects.map((name) => {
            const first = questions.findIndex((x) => x.subject === name);
            const active = q.subject === name;
            return (
              <button key={name} type="button" onClick={() => go(first)}
                className={`whitespace-nowrap rounded-t-md px-4 py-1.5 text-sm font-semibold ${active ? "bg-white text-blue-800 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>
                {name}
              </button>
            );
          })}
        </nav>
        <p className={`px-3 py-1 text-xs sm:hidden ${status === "offline" ? "bg-red-50 font-semibold text-red-700" : "text-slate-500"}`}>
          {status === "saved" ? "All answers saved" : status === "saving" ? "Saving…" : "No connection: answers kept, retrying"}
        </p>
      </header>

      {notice && (
        <div className="flex items-center justify-between gap-3 bg-amber-100 px-4 py-2 text-sm text-amber-900">
          {notice}
          <button type="button" onClick={() => setNotice(null)} className="font-semibold">OK</button>
        </div>
      )}

      <div className="flex flex-1">
        {/* Question */}
        <main className="min-w-0 flex-1 p-3 sm:p-5">
          <div className="rounded-lg border border-slate-300 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-2">
              <p className="font-bold text-slate-900">
                Question {q.position}
                <span className="ml-2 text-sm font-normal text-slate-500">
                  {q.section} · {q.type === "mcq" ? "Multiple choice" : "Numerical answer"}
                </span>
              </p>
              <p className="text-sm text-slate-600">
                Marks <span className="font-semibold text-green-700">+{q.marks_correct}</span>{" "}
                <span className="font-semibold text-red-700">{q.marks_wrong}</span>
              </p>
            </div>
            <div className="space-y-4 p-4 pb-28">
              {q.body && <p className="whitespace-pre-wrap text-base leading-7 text-slate-900">{q.body}</p>}
              {q.image_path && imageUrls[q.image_path] && (
                <img src={imageUrls[q.image_path]} alt={`Question ${q.position}`} className="max-w-full select-none" draggable={false}
                  onContextMenu={(e) => e.preventDefault()} />
              )}
              {q.image_path && !imageUrls[q.image_path] && (
                <p className="text-sm text-red-700">The picture for this question could not be loaded. Refresh the page.</p>
              )}

              {q.type === "mcq" ? (
                <div className="space-y-2" role="radiogroup" aria-label="Options">
                  {optionsInPicture && <p className="text-sm text-slate-500">Choose the option shown in the question.</p>}
                  {LABELS.map((l, li) => {
                    const o = q.options.find((x) => x.label === l);
                    const chosen = draftSel === l;
                    return (
                      <label key={l} className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 ${chosen ? "border-blue-600 bg-blue-50" : "border-slate-200 hover:bg-slate-50"}`}>
                        <input type="radio" name={`q-${q.question_id}`} className="mt-1.5 h-4 w-4" checked={chosen}
                          onChange={() => setDraftSel(l)} />
                        <span className="font-bold text-slate-700">({l})</span>
                        <span className="min-w-0 flex-1">
                          {o?.body && <span className="whitespace-pre-wrap text-slate-900">{o.body}</span>}
                          {o?.image_path && imageUrls[o.image_path] && (
                            <img src={imageUrls[o.image_path]} alt={`Option ${l}`} className="mt-1 max-h-48 max-w-full" draggable={false} />
                          )}
                          {optionsInPicture && <span className="text-slate-500">Option {l} · ({li + 1})</span>}
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div className="max-w-xs space-y-2">
                  <label htmlFor="num" className="text-sm font-medium text-slate-700">Your answer</label>
                  <input id="num" inputMode="decimal" autoComplete="off" value={draftNum}
                    onChange={(e) => setDraftNum(cleanNumber(e.target.value))}
                    className={`field font-mono text-lg ${draftValid ? "" : "border-red-500"}`} />
                  <div className="grid grid-cols-4 gap-1.5">
                    {["7", "8", "9", "⌫", "4", "5", "6", "-", "1", "2", "3", ".", "0", "Clear"].map((k) => (
                      <button key={k} type="button"
                        className={`rounded-md border border-slate-300 bg-white py-2 font-semibold text-slate-800 hover:bg-slate-100 ${k === "Clear" ? "col-span-3" : ""}`}
                        onClick={() => {
                          if (k === "⌫") setDraftNum((v) => v.slice(0, -1));
                          else if (k === "Clear") setDraftNum("");
                          else setDraftNum((v) => cleanNumber(v + k));
                        }}>
                        {k}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {changedFromSaved && (
                <p className="text-sm font-medium text-amber-800">
                  Not saved yet: press <b>Save &amp; Next</b> or <b>Save &amp; Mark for Review</b> to keep this answer.
                </p>
              )}
            </div>
          </div>
        </main>

        {/* Palette, desktop */}
        <aside className="hidden w-80 shrink-0 border-l border-slate-300 bg-white p-4 lg:block">
          <div className="sticky top-32">{palette}</div>
        </aside>
      </div>

      {/* Palette, phone */}
      {showPalette && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/40 lg:hidden" onClick={() => setShowPalette(false)}>
          <div className="h-full w-80 max-w-[90vw] overflow-y-auto bg-white p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <p className="font-bold text-slate-900">Questions</p>
              <button type="button" onClick={() => setShowPalette(false)} className="text-sm font-semibold text-blue-700">Close</button>
            </div>
            {palette}
          </div>
        </div>
      )}

      {/* Actions */}
      <footer className="sticky bottom-0 z-20 border-t border-slate-300 bg-white px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={saveAndNext} className="rounded-md bg-green-600 px-3 py-2 text-sm font-bold text-white hover:bg-green-700">
            SAVE &amp; NEXT
          </button>
          <button type="button" onClick={saveAndMark} className="rounded-md bg-amber-500 px-3 py-2 text-sm font-bold text-white hover:bg-amber-600">
            SAVE &amp; MARK FOR REVIEW
          </button>
          <button type="button" onClick={clear} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50">
            CLEAR
          </button>
          <button type="button" onClick={markAndNext} className="rounded-md bg-purple-600 px-3 py-2 text-sm font-bold text-white hover:bg-purple-700">
            MARK FOR REVIEW &amp; NEXT
          </button>
          <span className="ml-auto flex gap-2">
            <button type="button" onClick={() => go(idx - 1)} disabled={idx === 0}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-bold text-slate-800 disabled:opacity-40">
              &lt;&lt; BACK
            </button>
            <button type="button" onClick={next}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-bold text-slate-800">
              NEXT &gt;&gt;
            </button>
            <button type="button" onClick={() => { void flush(); setConfirming(true); }}
              className="rounded-md bg-blue-700 px-4 py-2 text-sm font-bold text-white hover:bg-blue-800">
              SUBMIT
            </button>
          </span>
        </div>
      </footer>

      {/* Submit confirmation */}
      {(confirming || submitting || submitError) && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <div className="w-full max-w-lg space-y-4 rounded-xl bg-white p-5">
            <h2 className="text-lg font-bold text-slate-900">{submitting ? "Submitting…" : "Submit the test?"}</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-slate-500">
                  <tr>
                    <th className="py-1 pr-2 font-medium">Subject</th>
                    <th className="py-1 pr-2 font-medium">Answered</th>
                    <th className="py-1 pr-2 font-medium">Not answered</th>
                    <th className="py-1 pr-2 font-medium">Marked</th>
                    <th className="py-1 font-medium">Not visited</th>
                  </tr>
                </thead>
                <tbody>
                  {subjects.map((name) => {
                    const c = counts(questions.filter((x) => x.subject === name));
                    return (
                      <tr key={name} className="border-t border-slate-100">
                        <td className="py-1 pr-2 font-medium text-slate-900">{name}</td>
                        <td className="py-1 pr-2">{c.answered + c.answered_marked}</td>
                        <td className="py-1 pr-2">{c.not_answered}</td>
                        <td className="py-1 pr-2">{c.marked + c.answered_marked}</td>
                        <td className="py-1">{c.not_visited}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-sm text-slate-600">
              Answers marked for review that have an answer are evaluated. After submitting you
              cannot change any answer.
            </p>
            {submitError && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{submitError}</p>}
            <div className="flex flex-wrap justify-end gap-2">
              {!submitting && (
                <button type="button" className="btn-outline" onClick={() => { setConfirming(false); setSubmitError(null); }}>
                  Back to the test
                </button>
              )}
              <button type="button" className="btn" disabled={submitting} onClick={() => void submit(false)}>
                {submitting ? "Submitting…" : "Yes, submit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
