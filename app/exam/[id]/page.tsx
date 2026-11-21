import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signImages, type AttemptPaper } from "@/lib/exam";
import { ExamScreen } from "./exam-screen";

export const metadata: Metadata = { title: "Test in progress" };

export default async function ExamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_attempt_paper", { p_attempt: id });
  if (error || !data) notFound();
  const paper = data as AttemptPaper;

  if (paper.attempt.status !== "in_progress") redirect(`/results/${id}`);
  if (Date.parse(paper.attempt.deadline_at) + 90_000 < Date.parse(paper.attempt.now)) {
    await supabase.rpc("submit_attempt", { p_attempt: id });
    redirect(`/results/${id}`);
  }

  const imageUrls = await signImages(
    supabase,
    paper.questions.flatMap((q) => [q.image_path, ...q.options.map((o) => o.image_path)]),
  );

  return (
    <ExamScreen
      attemptId={paper.attempt.id}
      testCode={paper.test.code ?? ""}
      testTitle={paper.test.title}
      studentName={profile.full_name ?? ""}
      isTrial={paper.attempt.is_trial}
      deadlineMs={Date.parse(paper.attempt.deadline_at)}
      serverNowMs={Date.parse(paper.attempt.now)}
      questions={paper.questions}
      responses={paper.responses}
      imageUrls={imageUrls}
    />
  );
}
