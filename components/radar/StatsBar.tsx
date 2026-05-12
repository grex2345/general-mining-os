"use client";

import {
  Coins,
  Sparkles,
  TrendingUp,
  Award,
  Activity,
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════
// 📊 STATS BAR - شريط الإحصائيات الاحترافي
// ═══════════════════════════════════════════════════════════════

interface StatsBarProps {
  totalCoins: number;
  totalOpportunities: number;
  totalMarketCap: number;
  totalVolume24h: number;
  averageScore: number;
  topScore: number;
  hiddenGems: number;
  pumpAlerts: number;
  loading?: boolean;
}

// ═══════════════════════════════════════════════════════════════
// 🎨 HELPERS
// ═══════════════════════════════════════════════════════════════
function formatLargeNumber(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

// ═══════════════════════════════════════════════════════════════
// 🎯 STAT CARD COMPONENT
// ═══════════════════════════════════════════════════════════════
interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: string | number;
  subValue?: string;
  iconColor: string;
  iconBg: string;
  loading?: boolean;
}

function StatCard({
  icon: Icon,
  label,
  value,
  subValue,
  iconColor,
  iconBg,
  loading,
}: StatCardProps) {
  return (
    <div
      className="
        group relative
        flex items-center gap-4 p-5
        bg-[#0d0d14]/60 backdrop-blur-xl
        border border-white/[0.06]
        rounded-xl
        hover:border-white/[0.12]
        transition-all duration-200
        overflow-hidden
      "
    >
      {/* Hover glow */}
      <div
        className={`
          absolute inset-0 opacity-0 group-hover:opacity-100
          transition-opacity duration-300 pointer-events-none
        `}
        style={{
          background: `radial-gradient(circle at top right, ${iconBg.replace("bg-", "rgba(").replace("/10", ", 0.05)")}, transparent 70%)`,
        }}
      />

      {/* Icon */}
      <div
        className={`
          relative shrink-0 w-11 h-11 rounded-xl
          ${iconBg} ${iconColor}
          flex items-center justify-center
          border border-white/[0.06]
        `}
      >
        <Icon className="w-5 h-5" strokeWidth={2} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">
          {label}
        </div>

        {loading ? (
          <div className="h-7 w-20 bg-white/[0.06] rounded animate-pulse" />
        ) : (
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white tracking-tight tabular-nums">
              {value}
            </span>
            {subValue && (
              <span className="text-xs font-medium text-slate-500 tabular-nums">
                {subValue}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 📊 MAIN STATS BAR
// ═══════════════════════════════════════════════════════════════
export function StatsBar({
  totalCoins,
  totalOpportunities,
  totalMarketCap,
  totalVolume24h,
  averageScore,
  topScore,
  hiddenGems,
  pumpAlerts,
  loading = false,
}: StatsBarProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      {/* Total Coins */}
      <StatCard
        icon={Coins}
        label="إجمالي العملات"
        value={loading ? "..." : totalCoins}
        iconColor="text-blue-400"
        iconBg="bg-blue-500/10"
        loading={loading}
      />

      {/* Total Opportunities */}
      <StatCard
        icon={Sparkles}
        label="الفرص المكتشفة"
        value={loading ? "..." : totalOpportunities}
        subValue={`${hiddenGems}💎 ${pumpAlerts}🚀`}
        iconColor="text-emerald-400"
        iconBg="bg-emerald-500/10"
        loading={loading}
      />

      {/* Total Market Cap */}
      <StatCard
        icon={TrendingUp}
        label="إجمالي القيمة السوقية"
        value={loading ? "..." : formatLargeNumber(totalMarketCap)}
        iconColor="text-purple-400"
        iconBg="bg-purple-500/10"
        loading={loading}
      />

      {/* Volume 24h */}
      <StatCard
        icon={Activity}
        label="حجم التداول (24س)"
        value={loading ? "..." : formatLargeNumber(totalVolume24h)}
        iconColor="text-amber-400"
        iconBg="bg-amber-500/10"
        loading={loading}
      />

      {/* Average / Top Score */}
      <StatCard
        icon={Award}
        label="متوسط النقاط"
        value={loading ? "..." : averageScore}
        subValue={`أعلى: ${topScore}`}
        iconColor="text-pink-400"
        iconBg="bg-pink-500/10"
        loading={loading}
      />
    </div>
  );
}