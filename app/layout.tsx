import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";

// ═══════════════════════════════════════════════════════════════
// 📋 METADATA
// ═══════════════════════════════════════════════════════════════
export const metadata: Metadata = {
  title: "General Mining OS - Pro Dashboard",
  description:
    "نظام تشغيل احترافي لإدارة مزرعة تعدين GPU - رادار الفرص الذهبية",
  manifest: "/manifest.json",
  themeColor: "#0a0a0f",
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
  },
};

// ═══════════════════════════════════════════════════════════════
// 🎨 ROOT LAYOUT
// ═══════════════════════════════════════════════════════════════
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl" className="dark">
      <head>
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body className="min-h-screen bg-[#0a0a0f] text-slate-100 antialiased">
        {/* ═══════════════════════════════════════════════════════ */}
        {/* 🌌 BACKGROUND EFFECTS (Glow + Grid)                     */}
        {/* ═══════════════════════════════════════════════════════ */}
        <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
          {/* Gradient orbs */}
          <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-purple-500/5 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-blue-500/5 rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-emerald-500/3 rounded-full blur-3xl" />

          {/* Grid pattern */}
          <div
            className="absolute inset-0 opacity-[0.015]"
            style={{
              backgroundImage: `
                linear-gradient(to right, #ffffff 1px, transparent 1px),
                linear-gradient(to bottom, #ffffff 1px, transparent 1px)
              `,
              backgroundSize: "50px 50px",
            }}
          />
        </div>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* 📐 MAIN LAYOUT (Sidebar + Content)                       */}
        {/* ═══════════════════════════════════════════════════════ */}
        <div className="flex h-screen overflow-hidden">
          {/* Sidebar (right side in RTL) */}
          <Sidebar />

          {/* Main content area */}
          <main className="flex-1 overflow-y-auto">
            <div className="min-h-full">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}