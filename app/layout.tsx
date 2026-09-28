import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kargo CV Scorer",
  description: "Score Product Manager and Senior Product Manager CVs against Kargo's hiring rubric.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-surface text-gray-100 antialiased">{children}</body>
    </html>
  );
}
