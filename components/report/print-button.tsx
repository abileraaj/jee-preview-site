"use client";

export function PrintButton({ label = "Download PDF / Print" }: { label?: string }) {
  return (
    <button type="button" className="btn-outline px-3 py-2 text-sm print:hidden" onClick={() => window.print()}>
      {label}
    </button>
  );
}
