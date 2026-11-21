import Link from "next/link";
import { brand } from "@/lib/config";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 text-slate-900">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-sm font-bold text-white">
        {brand.name.charAt(0)}
      </span>
      <span className="leading-tight">
        <span className="block text-lg font-bold">{brand.name}</span>
        <span className="block text-[11px] font-medium text-slate-500">by {brand.company}</span>
      </span>
    </Link>
  );
}
