"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Radar,
  TrendingUp,
  Settings,
  Activity,
  Zap,
  ChevronLeft,
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════
// 📋 NAVIGATION ITEMS
// ═══════════════════════════════════════════════════════════════
const navItems = [
  {
    href: "/",
    label: "لوحة التحكم",
    icon: LayoutDashboard,
    badge: null,
  },
  {
    href: "/radar",
    label: "رادار الفرص",
    icon: Radar,
    badge: "جديد",
    badgeColor: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  },
  {
    href: "/trends",
    label: "الاتجاهات",
    icon: TrendingUp,
    badge: "قريباً",
    badgeColor: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  },
  {
    href: "/settings",
    label: "الإعدادات",
    icon: Settings,
    badge: null,
  },
];

// ═══════════════════════════════════════════════════════════════
// 🎨 SIDEBAR COMPONENT
// ═══════════════════════════════════════════════════════════════
export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="
        flex flex-col
        w-64 shrink-0
        bg-[#0d0d14]/80 backdrop-blur-xl
        border-l border-white/[0.06]
        relative
      "
    >
      {/* ═══════════════════════════════════════════════════════ */}
      {/* 🌟 GLOW EFFECT (top)                                      */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent" />

      {/* ═══════════════════════════════════════════════════════ */}
      {/* 🎯 LOGO SECTION                                           */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div className="p-6 border-b border-white/[0.06]">
        <Link href="/" className="group flex items-center gap-3">
          {/* Logo icon with glow */}
          <div className="relative">
            <div className="absolute inset-0 bg-emerald-500/30 blur-xl group-hover:bg-emerald-500/50 transition-all duration-300" />
            <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/30">
              <Zap className="w-5 h-5 text-black" strokeWidth={2.5} />
            </div>
          </div>

          {/* Brand name */}
          <div className="flex flex-col">
            <span className="text-[15px] font-bold text-white tracking-tight">
              Mining OS
            </span>
            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-medium">
              Pro Terminal
            </span>
          </div>
        </Link>
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* 📍 NAVIGATION                                             */}
      {/* ═══════════════════════════════════════════════════════ */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        <div className="mb-3 px-3">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
            القائمة
          </span>
        </div>

        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                group relative flex items-center justify-between
                px-3 py-2.5 rounded-lg
                transition-all duration-200
                ${
                  isActive
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    : "text-slate-400 hover:text-white hover:bg-white/[0.04] border border-transparent"
                }
              `}
            >
              {/* Active indicator (left bar) */}
              {isActive && (
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-emerald-400 rounded-l-full shadow-lg shadow-emerald-400/50" />
              )}

              <div className="flex items-center gap-3">
                <Icon
                  className={`
                    w-[18px] h-[18px]
                    ${isActive ? "text-emerald-400" : "text-slate-500 group-hover:text-slate-300"}
                  `}
                  strokeWidth={2}
                />
                <span className="text-[13px] font-medium">{item.label}</span>
              </div>

              {/* Badge */}
              {item.badge && (
                <span
                  className={`
                    text-[10px] font-semibold px-2 py-0.5 rounded-md border
                    ${item.badgeColor || "bg-slate-500/20 text-slate-400 border-slate-500/30"}
                  `}
                >
                  {item.badge}
                </span>
              )}

              {/* Hover arrow */}
              {!isActive && (
                <ChevronLeft className="w-4 h-4 text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* 📊 STATUS PANEL (bottom)                                  */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div className="p-4 border-t border-white/[0.06] space-y-3">
        {/* Live status */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]">
          <div className="flex items-center gap-2">
            <div className="relative">
              <div className="absolute inset-0 bg-emerald-400 blur-sm animate-pulse" />
              <div className="relative w-2 h-2 rounded-full bg-emerald-400" />
            </div>
            <span className="text-[11px] font-medium text-slate-300">
              النظام نشط
            </span>
          </div>
          <Activity className="w-3.5 h-3.5 text-emerald-400" strokeWidth={2.5} />
        </div>

        {/* Version */}
        <div className="flex items-center justify-between px-1">
          <span className="text-[10px] text-slate-600 font-mono">v0.3.0</span>
          <span className="text-[10px] text-slate-600 font-medium">
            Pro Edition
          </span>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* 🌟 GLOW EFFECT (bottom)                                   */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" />
    </aside>
  );
}