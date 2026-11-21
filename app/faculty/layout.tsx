import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";

export default async function FacultyLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole(["faculty", "admin"]);
  return <AppShell profile={profile}>{children}</AppShell>;
}
