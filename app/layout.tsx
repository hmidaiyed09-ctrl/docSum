import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DocSum — Learn any document, step by step",
  description:
    "Upload your course documents and DocSum's AI turns them into a complete interactive lesson plan.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full bg-ink text-slate-100 antialiased">{children}</body>
    </html>
  );
}
