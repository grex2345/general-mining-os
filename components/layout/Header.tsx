"use client";

import { Menu } from "lucide-react";
import { useEffect, useState } from "react";
import NotificationBell from "./NotificationBell";
import ThemeToggle from "./ThemeToggle";

type HeaderProps = {
  onMenuClick: () => void;
};

export default function Header({ onMenuClick }: HeaderProps) {
  const [time, setTime] = useState<string>("");

  useEffect(() => {
    const updateTime = () => {
      setTime(
        new Date().toLocaleTimeString("ar-MA", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="sticky top-0 z-30 bg-slate-950/80 dark:bg-slate-950/80 light:bg-white/80 backdrop-blur-md border-b border-slate-800 dark:border-slate-800 light:border-slate-200">
      <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
        {/* Hamburger - mobile only */}
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
          aria-label="فتح القائمة"
        >
          <Menu className="w-6 h-6" />
        </button>

        {/* Logo on mobile */}
        <h2 className="lg:hidden text-base font-bold text-green-400">
          ⛏️ Mining OS
        </h2>

        {/* Page title on desktop */}
        <div className="hidden lg:block">
          <h2 className="text-sm font-medium text-slate-300">لوحة التحكم</h2>
          <p className="text-xs text-slate-500">مرحباً بك يا الجنرال 👑</p>
        </div>

        {/* Right side: Theme + Bell + Status + Time */}
        <div className="flex items-center gap-1 sm:gap-2">
          {/* 🌓 Theme Toggle */}
          <ThemeToggle />

          {/* 🔔 Notification Bell */}
          <NotificationBell />

          {/* Status (hidden on small mobile) */}
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/10 border border-green-500/30">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs text-green-400 font-medium">متصل</span>
          </div>

          {/* Time */}
          <div className="px-2.5 py-1 rounded-lg bg-slate-800/60 border border-slate-700">
            <span className="text-xs font-mono text-slate-300">{time}</span>
          </div>
        </div>
      </div>
    </header>
  );
}