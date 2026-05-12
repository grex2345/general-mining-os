"use client";

import { Search, Filter, X } from "lucide-react";

// ═══════════════════════════════════════════════════════════════
// 🔍 FILTERS PANEL
// ═══════════════════════════════════════════════════════════════

export interface FilterState {
  search: string;
  status: "all" | "active" | "watchlist" | "dead";
  tier: "all" | "excellent" | "good" | "average" | "poor";
  maxVram: number | null;
}

interface FiltersPanelProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  onReset: () => void;
}

// ═══════════════════════════════════════════════════════════════
// 🎯 MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════
export function FiltersPanel({ filters, onChange, onReset }: FiltersPanelProps) {
  const hasActiveFilters =
    filters.search !== "" ||
    filters.status !== "all" ||
    filters.tier !== "all" ||
    filters.maxVram !== null;

  return (
    <div
      className="
        bg-[#0d0d14]/60 backdrop-blur-xl
        border border-white/[0.06]
        rounded-xl p-4
      "
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <h3 className="text-sm font-bold text-white">الفلاتر</h3>
        </div>

        {hasActiveFilters && (
          <button
            onClick={onReset}
            className="
              inline-flex items-center gap-1
              text-xs text-slate-500 hover:text-slate-300
              transition-colors
            "
          >
            <X className="w-3 h-3" />
            مسح الكل
          </button>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* SEARCH                                                    */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div className="relative mb-4">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
        <input
          type="text"
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          placeholder="ابحث عن عملة..."
          className="
            w-full pr-10 pl-3 py-2.5
            bg-white/[0.03] border border-white/[0.06]
            rounded-lg
            text-sm text-white placeholder:text-slate-600
            focus:outline-none focus:border-emerald-500/30 focus:bg-white/[0.05]
            transition-all
          "
        />
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* STATUS FILTER                                             */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div className="mb-4">
        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block">
          الحالة
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          {(["all", "active", "watchlist", "dead"] as const).map((status) => {
            const isActive = filters.status === status;
            const labels = {
              all: "الكل",
              active: "نشطة",
              watchlist: "مراقبة",
              dead: "ميتة",
            };

            return (
              <button
                key={status}
                onClick={() => onChange({ ...filters, status })}
                className={`
                  px-3 py-2 rounded-lg text-xs font-medium
                  transition-all duration-150
                  ${
                    isActive
                      ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                      : "bg-white/[0.03] text-slate-400 border border-white/[0.04] hover:bg-white/[0.05] hover:text-slate-300"
                  }
                `}
              >
                {labels[status]}
              </button>
            );
          })}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* TIER FILTER                                               */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div className="mb-4">
        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block">
          التصنيف
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          {(["all", "excellent", "good", "average", "poor"] as const).map((tier) => {
            const isActive = filters.tier === tier;
            const labels = {
              all: "الكل",
              excellent: "ممتاز",
              good: "جيد",
              average: "متوسط",
              poor: "ضعيف",
            };
            const colors = {
              all: "emerald",
              excellent: "emerald",
              good: "blue",
              average: "amber",
              poor: "orange",
            };

            return (
              <button
                key={tier}
                onClick={() => onChange({ ...filters, tier })}
                className={`
                  px-3 py-2 rounded-lg text-xs font-medium
                  transition-all duration-150
                  ${
                    isActive
                      ? `bg-${colors[tier]}-500/15 text-${colors[tier]}-400 border border-${colors[tier]}-500/30`
                      : "bg-white/[0.03] text-slate-400 border border-white/[0.04] hover:bg-white/[0.05]"
                  }
                `}
              >
                {labels[tier]}
              </button>
            );
          })}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* VRAM FILTER                                               */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div>
        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block">
          الحد الأقصى VRAM
        </label>
        <div className="grid grid-cols-4 gap-1.5">
          {[null, 4, 6, 8].map((vram) => {
            const isActive = filters.maxVram === vram;
            const label = vram === null ? "الكل" : `${vram}GB`;

            return (
              <button
                key={String(vram)}
                onClick={() => onChange({ ...filters, maxVram: vram })}
                className={`
                  px-3 py-2 rounded-lg text-xs font-medium
                  transition-all duration-150
                  ${
                    isActive
                      ? "bg-purple-500/15 text-purple-400 border border-purple-500/30"
                      : "bg-white/[0.03] text-slate-400 border border-white/[0.04] hover:bg-white/[0.05]"
                  }
                `}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}