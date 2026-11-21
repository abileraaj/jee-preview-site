import Link from "next/link";
import { Logo } from "@/components/logo";
import type { Profile } from "@/lib/types";

// Header and frame shared by the student, faculty and admin areas.
export function AppShell({ profile, children }: { profile: Profile; children: React.ReactNode }) {
  const links = [
    { href: "/dashboard", label: "Dashboard", show: true },
    { href: "/progress", label: "Progress", show: true },
    { href: "/account", label: "Account", show: true },
    { href: "/faculty", label: "Faculty", show: profile.role !== "student" },
    { href: "/admin", label: "Admin", show: profile.role === "admin" },
  ].filter((l) => l.show);

  return (
    <>
      <header className="border-b border-slate-200 bg-white print:hidden">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
          <Logo href="/dashboard" />
          <nav className="flex items-center gap-4 text-sm font-medium text-slate-700">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="hover:text-slate-900">
                {l.label}
              </Link>
            ))}
            <form action="/auth/signout" method="post">
              <button className="text-slate-500 hover:text-slate-900">Log out</button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </>
  );
}
