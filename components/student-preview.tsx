/* eslint-disable @next/next/no-img-element */
import { LABELS, type Label } from "@/lib/papers";

export type PreviewQuestion = {
  position: number;
  subjectName: string;
  sectionName: string;
  type: "mcq" | "numerical";
  marksCorrect: number;
  marksWrong: number;
  body: string;
  imageUrl: string | null;
  options: Record<Label, { body: string; imageUrl: string | null }>;
};

// The question exactly as a student will see it during the test.
export function StudentPreview({ q }: { q: PreviewQuestion }) {
  return (
    <div className="rounded-lg border border-slate-300 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm">
        <span className="font-semibold text-slate-900">
          Question {q.position} <span className="font-normal text-slate-500">· {q.subjectName} · {q.sectionName}</span>
        </span>
        <span className="text-slate-600">
          Marks: <span className="font-medium text-green-700">+{q.marksCorrect}</span>{" "}
          <span className="font-medium text-red-700">{q.marksWrong}</span>
        </span>
      </div>
      <div className="space-y-4 p-4">
        {q.body && <p className="whitespace-pre-wrap text-base leading-7 text-slate-900">{q.body}</p>}
        {q.imageUrl && <img src={q.imageUrl} alt={`Question ${q.position}`} className="max-h-[420px] max-w-full" />}
        {q.type === "mcq" ? (
          <div className="space-y-2">
            {LABELS.map((l) => {
              const o = q.options[l];
              const empty = !o.body && !o.imageUrl;
              return (
                <label key={l} className="flex items-start gap-3 rounded-lg border border-slate-200 px-3 py-2.5">
                  <input type="radio" disabled className="mt-1.5" />
                  <span className="font-semibold text-slate-700">{l}</span>
                  <span className="min-w-0 flex-1">
                    {o.body && <span className="whitespace-pre-wrap text-slate-900">{o.body}</span>}
                    {o.imageUrl && <img src={o.imageUrl} alt={`Option ${l}`} className="mt-1 max-h-48 max-w-full" />}
                    {empty && <span className="text-slate-400">(shown in the question picture)</span>}
                  </span>
                </label>
              );
            })}
          </div>
        ) : (
          <div>
            <p className="mb-1 text-sm text-slate-600">Enter your answer</p>
            <input disabled placeholder="Number keypad appears here" className="field max-w-xs bg-slate-50" />
          </div>
        )}
      </div>
    </div>
  );
}
