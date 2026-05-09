"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  TrendingUp,
  Sun,
  Wallet,
  Rocket,
  Bell,
  Calculator,
  Scale,
  Cpu,
  Bot,
  Settings,
  Brain,
  X,
} from "lucide-react";

const menuItems = [
  { href: "/", label: "لوحة التحكم", icon: LayoutDashboard },
  { href: "/coins", label: "مركز الأرباح", icon: TrendingUp },
  { href: "/workers", label: "الأجهزة", icon: Cpu },
  { href: "/solar", label: "الطاقة الشمسية", icon: Sun },
  { href: "/wallet", label: "المحفظة", icon: Wallet },
  { href: "/growth", label: "خطة النمو", icon: Rocket },
  { href: "/alerts", label: "التنبيهات", icon: Bell },
  { href: "/calculator", label: "دراسة الجدوى", icon: Calculator },
  { href: "/compare", label: "مقارنة الأسعار", icon: Scale },
  { href: "/ai-comparison", label: "AI vs Mining", icon: Bot },
  { href: "/ai-coach", label: "المدرب الذكي 🧠", icon: Brain },
];

type SidebarProps = {
  isOpen: boolean;
  onClose: () => void;
};

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {/* 📱 Overlay على الموبايل (يغلق Sidebar عند الضغط) */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
        />
      )}

      {/* 🎯 Sidebar */}
      <aside
        className={`
          fixed lg:sticky top-0 right-0 z-50
          w-64 h-screen bg-slate-900 border-l border-slate-800
          p-4 flex flex-col
          transition-transform duration-300 ease-in-out
          ${isOpen ? "translate-x-0" : "translate-x-full"}
          lg:translate-x-0
        `}
      >
        {/* Header مع زر الإغلاق على الموبايل */}
        <div className="mb-8 px-2 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-green-400">
              ⛏️ General Mining OS
            </h1>
            <p className="text-xs text-slate-500 mt-1">v0.2 — Gojo 👑</p>
          </div>
          {/* زر الإغلاق - يظهر فقط على الموبايل */}
          <button
            onClick={onClose}
            className="lg:hidden p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex flex-col gap-1 flex-1 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-right transition-all ${
                  isActive
                    ? "bg-green-500/10 text-green-400 border border-green-500/20"
                    : "text-slate-400 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                <span className="text-sm font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* ⚙️ زر الإعدادات */}
        <div className="mt-4 mb-3">
          <Link
            href="/settings"
            onClick={onClose}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-right transition-all ${
              pathname === "/settings"
                ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                : "text-slate-400 hover:bg-slate-800 hover:text-white border border-slate-700"
            }`}
          >
            <Settings className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm font-medium">⚙️ الإعدادات</span>
          </Link>
        </div>

        <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <p className="text-xs text-slate-300">المزرعة شغالة</p>
          </div>
        </div>
      </aside>
    </>
  );
}