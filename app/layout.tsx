import type { Metadata, Viewport } from "next";
import { brand } from "@/lib/config";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: `${brand.name} ${brand.series} | by ${brand.company}`, template: `%s | ${brand.name}` },
  description: brand.tagline,
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
