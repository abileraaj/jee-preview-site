import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signImages } from "@/lib/exam";
import type { Report } from "@/lib/report";
import { ReportView } from "@/components/report/report-view";
import { discardTrial } from "@/app/exam/actions";

export const metadata: Metadata = { title: "Report card" };

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_attempt_report", { p_attempt: id });
  if (error || !data) notFound();
  const r = data as Report;
  const imageUrls = await signImages(supabase, r.questions.flatMap((q) => [q.image_path, ...q.options.map((o) => o.image_path)]));
  const ownTrial = r.attempt.is_trial && r.attempt.user_id === profile.id;
  return (
    <ReportView r={r} imageUrls={imageUrls} ownTrial={ownTrial}
      deleteTrial={ownTrial ? discardTrial.bind(null, r.attempt.id, r.test.id) : undefined} />
  );
}
