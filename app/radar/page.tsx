"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  LayoutDashboard,
  TrendingUp,
  TrendingDown,
  Sparkles,
  Radar,
  Coins,
  DollarSign,
  Activity,
  ArrowLeft,
  Award,
  Zap,
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════
// 📊 TYPES
// ═══════════════════════════════════════════════════════════════
interface DashboardStats {
  totals: {
    totalCoins: number;
    totalOpportunities: number;
    totalMarketCap: number;
    totalVolume24h: number;
  };
  classification: {
    byTier: Record<string, number>;
  };
  opportunities: {
    hiddenGems: number;
    pumpAlerts: number;
    deadCoins: number;
    newListings: number;
  };
  topGainers: Array<{
    symbol: string;
    name: string;
    priceChange24h: number;
  }>;
  topLosers: Array<{
    symbol: string;
    name: string;
    priceChange24h: number;
  }>;
  topCoins: Array<{
    symbol: string;
    name: string;
    algorithm: string;
    price: number;
    score: number;
    tier: string;
  }>;
  topOpportunities: Array<{
    kind: string;
    emoji: string;
    title: string;
    signal: string;
    coinSymbol: string;
    coinName: string;
    confidence: number;
    riskLevel: string;
  }>;
  scoring: {
    averageScore: number;
    topScore: number;
  };
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

function formatPrice(price: number): string {
  if (price >= 1) return `$${price.toFixed(2)}`;
  if (price >= 0.01) return `$${price.toFixed(4)}`;
  return `$${price.toFixed(6)}`;
}

function getCoinColor(symbol: string): string {
  const colors = [
    "from-blue-500 to-blue-700",
    "from-purple-500 to-purple-700",
    "from-emerald-500 to-emerald-700",
    "from-pink-500 to-pink-700",
    "from-amber-500 to-amber-700",
    "from-cyan-500 to-cyan-700",
  ];
  const hash = symbol.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return colors[hash % colors.length];
}

function getCurrentTime(): string {
  const now = new Date();
  const hours = now.getHours().toString().padStart(2, "0");
  const minutes = now.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "صباح الخير";
  if (hour < 18) return "مساء الخير";
  return "مساء الخير";
}

// ═══════════════════════════════════════════════════════════════
// 🎯 MAIN DASHBOARD
// ═══════════════════════════════════════════════════════════════
export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(getCurrentTime());

  // Fetch data
  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch("/api/radar/stats");
        const data = await res.json();
        if (data.success) setStats(data.data);
      } catch (error) {
        console.error("Failed to fetch stats:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  // Update time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(getCurrentTime());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  if (loading || !stats) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-12 h-12 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mb-4" />
          <div className="text-slate-400">جاري تحميل لوحة التحكم...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 lg:p-8 space-y-6">
      {/* ═══════════════════════════════════════════════════════ */}
      {/* WELCOME HEADER                                            */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="relative">
              <div className="absolute inset-0 bg-emerald-500/30 blur-xl" />
              <div className="relative w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/30">
                <LayoutDashboard className="w-6 h-6 text-black" strokeWidth={2.5} />
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">
                {getGreeting()}, الجنرال 👑
              </h1>
              <p className="text-sm text-slate-400">
                مرحباً بك في Mining OS Pro Terminal
              </p>
            </div>
          </div>
        </div>

        {/* Live time */}
        <div className="flex items-center gap-3 px-4 py-2.5 bg-[#0d0d14]/60 backdrop-blur-xl border border-white/[0.06] rounded-xl">
          <div className="relative">
            <div className="absolute inset-0 bg-emerald-400 blur-sm animate-pulse" />
            <div className="relative w-2 h-2 rounded-full bg-emerald-400" />
          </div>
          <span className="text-sm font-mono text-slate-300 tabular-nums">
            {currentTime}
          </span>
          <span className="text-[10px] text-slate-500 uppercase tracking-widest">
            LIVE
          </span>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* QUICK STATS                                               */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Total Coins */}
        <Link
          href="/radar"
          className="group bg-[#0d0d14]/60 backdrop-blur-xl border border-white/[0.06] hover:border-blue-500/30 rounded-xl p-5 transition-all"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Coins className="w-5 h-5 text-blue-400" />
            </div>
            <ArrowLeft className="w-4 h-4 text-slate-600 group-hover:text-blue-400 transition-colors" />
          </div>
          <div className="text-3xl font-bold text-white tabular-nums mb-1">
            {stats.totals.totalCoins}
          </div>
          <div className="text-xs text-slate-500">عملة في الرادار</div>
        </Link>

        {/* Total Opportunities */}
        <Link
          href="/radar"
          className="group bg-[#0d0d14]/60 backdrop-blur-xl border border-white/[0.06] hover:border-emerald-500/30 rounded-xl p-5 transition-all"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-emerald-400" />
            </div>
            <ArrowLeft className="w-4 h-4 text-slate-600 group-hover:text-emerald-400 transition-colors" />
          </div>
          <div className="text-3xl font-bold text-white tabular-nums mb-1">
            {stats.totals.totalOpportunities}
          </div>
          <div className="text-xs text-slate-500">
            فرصة ذهبية ({stats.opportunities.hiddenGems}💎 {stats.opportunities.pumpAlerts}🚀)
          </div>
        </Link>

        {/* Market Cap */}
        <div className="bg-[#0d0d14]/60 backdrop-blur-xl border border-white/[0.06] rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-purple-400" />
            </div>
          </div>
          <div className="text-3xl font-bold text-white tabular-nums mb-1">
            {formatLargeNumber(stats.totals.totalMarketCap)}
          </div>
          <div className="text-xs text-slate-500">القيمة السوقية الكلية</div>
        </div>

        {/* Average Score */}
        <div className="bg-[#0d0d14]/60 backdrop-blur-xl border border-white/[0.06] rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Award className="w-5 h-5 text-amber-400" />
            </div>
          </div>
          <div className="text-3xl font-bold text-white tabular-nums mb-1">
            {stats.scoring.averageScore}
          </div>
          <div className="text-xs text-slate-500">
            متوسط النقاط (أعلى: {stats.scoring.topScore})
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* MAIN CONTENT GRID                                         */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ─── TOP COINS ─── */}
        <div className="bg-[#0d0d14]/60 backdrop-blur-xl border border-white/[0.06] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Award className="w-5 h-5 text-emerald-400" />
              <h2 className="text-base font-bold text-white">أفضل العملات</h2>
            </div>
            <Link
              href="/radar"
              className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
            >
              عرض الكل
              <ArrowLeft className="w-3 h-3" />
            </Link>
          </div>
          <div className="p-3 space-y-1">
            {stats.topCoins.map((coin, i) => (
              <div
                key={coin.symbol}
                className="flex items-center justify-between p-2.5 rounded-lg hover:bg-white/[0.03] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-600 font-mono w-4 tabular-nums">
                    {i + 1}
                  </span>
                  <div
                    className={`
                      w-9 h-9 rounded-full bg-gradient-to-br ${getCoinColor(coin.symbol)}
                      flex items-center justify-center text-white font-bold text-sm shadow-lg
                    `}
                  >
                    {coin.symbol.charAt(0)}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white">
                      {coin.name}
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono">
                      {coin.algorithm}
                    </div>
                  </div>
                </div>
                <div className="text-left">
                  <div className="inline-flex items-center px-2 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-md text-xs font-bold tabular-nums">
                    {coin.score}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                    {formatPrice(coin.price)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ─── TOP OPPORTUNITIES ─── */}
        <div className="bg-[#0d0d14]/60 backdrop-blur-xl border border-white/[0.06] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-400" />
              <h2 className="text-base font-bold text-white">أفضل الفرص</h2>
            </div>
            <Link
              href="/radar"
              className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
            >
              عرض الكل
              <ArrowLeft className="w-3 h-3" />
            </Link>
          </div>
          <div className="p-3 space-y-1">
            {stats.topOpportunities.map((opp, i) => (
              <div
                key={`${opp.coinSymbol}-${i}`}
                className="flex items-center justify-between p-2.5 rounded-lg hover:bg-white/[0.03] transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-2xl">{opp.emoji}</span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white truncate">
                      {opp.coinName}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {opp.title}
                    </div>
                  </div>
                </div>
                <div className="text-left shrink-0">
                  <div className="text-sm font-bold text-emerald-400 tabular-nums">
                    {opp.confidence}%
                  </div>
                  <div className="text-[11px] text-slate-500">ثقة</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* GAINERS / LOSERS                                          */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Gainers */}
        <div className="bg-[#0d0d14]/60 backdrop-blur-xl border border-white/[0.06] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.06] flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-bold text-white">أكبر الرابحين (24س)</h2>
          </div>
          <div className="p-3 space-y-1">
            {stats.topGainers.map((coin) => (
              <div
                key={coin.symbol}
                className="flex items-center justify-between p-2.5 rounded-lg hover:bg-white/[0.03] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`
                      w-8 h-8 rounded-full bg-gradient-to-br ${getCoinColor(coin.symbol)}
                      flex items-center justify-center text-white font-bold text-xs shadow-lg
                    `}
                  >
                    {coin.symbol.charAt(0)}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white">{coin.name}</div>
                    <div className="text-[11px] text-slate-500">{coin.symbol}</div>
                  </div>
                </div>
                <div className="inline-flex items-center gap-1 text-emerald-400 font-bold text-sm tabular-nums">
                  <TrendingUp className="w-3.5 h-3.5" />+{coin.priceChange24h.toFixed(2)}%
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Losers */}
        <div className="bg-[#0d0d14]/60 backdrop-blur-xl border border-white/[0.06] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.06] flex items-center gap-2">
            <TrendingDown className="w-5 h-5 text-red-400" />
            <h2 className="text-base font-bold text-white">أكبر الخاسرين (24س)</h2>
          </div>
          <div className="p-3 space-y-1">
            {stats.topLosers.map((coin) => (
              <div
                key={coin.symbol}
                className="flex items-center justify-between p-2.5 rounded-lg hover:bg-white/[0.03] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`
                      w-8 h-8 rounded-full bg-gradient-to-br ${getCoinColor(coin.symbol)}
                      flex items-center justify-center text-white font-bold text-xs shadow-lg
                    `}
                  >
                    {coin.symbol.charAt(0)}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white">{coin.name}</div>
                    <div className="text-[11px] text-slate-500">{coin.symbol}</div>
                  </div>
                </div>
                <div className="inline-flex items-center gap-1 text-red-400 font-bold text-sm tabular-nums">
                  <TrendingDown className="w-3.5 h-3.5" />
                  {coin.priceChange24h.toFixed(2)}%
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* QUICK ACTION                                              */}
      {/* ═══════════════════════════════════════════════════════ */}
      <Link
        href="/radar"
        className="
          group block relative overflow-hidden
          bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent
          border border-emerald-500/20 hover:border-emerald-500/40
          rounded-xl p-6
          transition-all duration-300
        "
      >
        <div className="absolute inset-0 bg-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
              <Radar className="w-7 h-7 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white mb-1">
                استكشف الرادار الكامل
              </h3>
              <p className="text-sm text-slate-400">
                {stats.totals.totalOpportunities} فرصة ذهبية في انتظارك +{" "}
                {stats.totals.totalCoins} عملة محلّلة
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-emerald-400 font-medium">
            <span>افتح الرادار</span>
            <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
          </div>
        </div>
      </Link>
    </div>
  );
}