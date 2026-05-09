"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/providers/theme-provider";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="relative p-2 rounded-lg hover:bg-slate-800 dark:hover:bg-slate-800 light:hover:bg-slate-200 text-slate-400 hover:text-yellow-400 transition-all group"
      aria-label="تبديل الوضع"
      title={theme === "dark" ? "الوضع النهاري" : "الوضع الليلي"}
    >
      {theme === "dark" ? (
        <Sun className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" />
      ) : (
        <Moon className="w-5 h-5 group-hover:-rotate-12 transition-transform duration-300" />
      )}
    </button>
  );
}