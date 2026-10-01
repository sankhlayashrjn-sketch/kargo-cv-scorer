import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kargo Hiring Dashboard",
  description: "Score, brief, and draft outreach for Product Manager and Senior Product Manager applicants.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-surface text-stone-100 antialiased">{children}</body>
    </html>
  );
}
