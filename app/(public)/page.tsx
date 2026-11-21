import Link from "next/link";
import { brand } from "@/lib/config";

const features = [
  {
    title: "The real exam screen",
    body: "Physics, Chemistry and Mathematics tabs, the NTA question palette, a 3-hour timer and a numerical keypad.",
  },
  {
    title: "Time on every question",
    body: "See how long you spent on each question, each section and each subject, including the ones you came back to.",
  },
  {
    title: "Rank and percentile",
    body: "Your rank and NTA-style percentile among everyone who took the same test, overall and per subject.",
  },
  {
    title: "Weak chapters, named",
    body: "A chapter-wise breakdown that tells you what to revise before the next test.",
  },
  {
    title: "Works on slow internet",
    body: "Every answer is saved as you go. If the network drops, you carry on where you stopped.",
  },
  {
    title: "A report card you can keep",
    body: "Download each test's performance sheet as a PDF and track your progress across the series.",
  },
];

const steps = [
  "Create a free account with your mobile number.",
  "Take a full mock test in the real exam format.",
  "Read your report: score, percentile, time per question, weak chapters.",
];

const faqs = [
  {
    q: "Which exam pattern do the tests follow?",
    a: "JEE Main Paper 1: 75 questions, 300 marks, 180 minutes. Each subject has 20 multiple-choice and 5 numerical questions, with +4 for a correct answer and -1 for a wrong one.",
  },
  {
    q: "Can I take the tests on my phone?",
    a: "Yes. The tests work on phones, tablets and laptops. A laptop is closest to the real exam.",
  },
  {
    q: "How is the percentile calculated?",
    a: "The same way NTA does it: the share of test-takers who scored the same as you or lower. It is calculated among students who took that test here.",
  },
  {
    q: "What does it cost?",
    a: "Everything is free during the pilot. Paid plans will be announced before the full launch.",
  },
];

export default function HomePage() {
  return (
    <>
      <section className="bg-gradient-to-b from-brand-50 to-white">
        <div className="mx-auto max-w-5xl px-4 py-16 text-center sm:py-24">
          <p className="mb-3 inline-block rounded-full bg-brand-100 px-3 py-1 text-sm font-medium text-brand-700">
            {brand.name} {brand.series} · by {brand.company}
          </p>
          <h1 className="mx-auto max-w-3xl text-3xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            {brand.tagline}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
            Full-length mocks in the real exam format, with a report that breaks down your score,
            percentile and time for every question.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/register" className="btn">Start free</Link>
            <a href="#features" className="btn-outline">See what you get</a>
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-5xl scroll-mt-16 px-4 py-14">
        <h2 className="text-2xl font-bold text-slate-900">What you get</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="card">
              <h3 className="font-semibold text-slate-900">{f.title}</h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-slate-50">
        <div className="mx-auto max-w-5xl px-4 py-14">
          <h2 className="text-2xl font-bold text-slate-900">How it works</h2>
          <ol className="mt-6 grid gap-4 sm:grid-cols-3">
            {steps.map((s, i) => (
              <li key={s} className="card">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-600 text-sm font-bold text-white">
                  {i + 1}
                </span>
                <p className="mt-3 text-slate-700">{s}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-5xl scroll-mt-16 px-4 py-14">
        <h2 className="text-2xl font-bold text-slate-900">Pricing</h2>
        <div className="card mt-6 max-w-md border-brand-500">
          <p className="text-sm font-medium text-brand-700">Pilot</p>
          <p className="mt-1 text-3xl font-bold text-slate-900">Free</p>
          <p className="mt-2 text-slate-600">
            Every test and every report is free while the pilot runs. Paid plans will be announced
            before the full launch.
          </p>
          <Link href="/register" className="btn mt-4 w-full">Create free account</Link>
        </div>
      </section>

      <section id="faq" className="bg-slate-50">
        <div className="mx-auto max-w-3xl scroll-mt-16 px-4 py-14">
          <h2 className="text-2xl font-bold text-slate-900">FAQs</h2>
          <div className="mt-6 space-y-3">
            {faqs.map((f) => (
              <details key={f.q} className="card group">
                <summary className="cursor-pointer list-none font-semibold text-slate-900">
                  {f.q}
                </summary>
                <p className="mt-2 text-slate-600">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
