import type { Metadata } from "next";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import AntdProvider from "./AntdProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kargo Hiring Dashboard",
  description: "Score, brief, and draft outreach for Product Manager and Senior Product Manager applicants.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="isolate relative min-h-screen overflow-x-hidden bg-surface text-stone-100 antialiased">
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          <div className="absolute -left-40 -top-40 h-[32rem] w-[32rem] rounded-full bg-accent-500/30 blur-[120px]" />
          <div className="absolute -right-32 top-1/3 h-[28rem] w-[28rem] rounded-full bg-amber-700/20 blur-[120px]" />
          <div className="absolute bottom-[-10rem] left-1/4 h-[30rem] w-[30rem] rounded-full bg-rose-900/20 blur-[130px]" />
        </div>
        <AntdRegistry>
          <AntdProvider>{children}</AntdProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
