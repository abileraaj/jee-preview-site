import Link from "next/link";
import { Logo } from "@/components/logo";
import { brand } from "@/lib/config";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Logo />
          <nav className="flex items-center gap-4 text-sm font-medium text-slate-700">
            <Link href="/#features" className="hidden hover:text-slate-900 sm:block">Features</Link>
            <Link href="/#pricing" className="hidden hover:text-slate-900 sm:block">Pricing</Link>
            <Link href="/#faq" className="hidden hover:text-slate-900 sm:block">FAQs</Link>
            <Link href="/login" className="btn px-3 py-1.5 text-sm">Log in</Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-slate-200 bg-slate-50">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-6 text-sm text-slate-600 sm:flex-row sm:justify-between">
          <p>© {new Date().getFullYear()} {brand.name} {brand.series} · {brand.company}</p>
          <p>
            Questions? <a className="underline" href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a>
          </p>
        </div>
      </footer>
    </>
  );
}
