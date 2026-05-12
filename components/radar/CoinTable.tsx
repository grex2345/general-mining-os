"use client";

import { useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowUpDown,
  Cpu,
  ExternalLink,
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════
// 📊 COIN TABLE - جدول العملات الاحترافي
// ═══════════════════════════════════════════════════════════════

export interface CoinRow {
  symbol: string;
  name: string;
  algorithm: string;
  status: string;
  gpuMineable: boolean;
  minVramGB: number | null;
  price: number | null;
  marketCap: number | null;
  volume24h: number | null;
  priceChange24h: number | null;
  liquidityScore: number | null;
  listingCount: number | null;
  reliability: string;
  score: number;
  tier: "excellent" | "good" | "average" | "poor" | "avoid";
  strengths: string[];
  weaknesses: string[];
}

interface CoinTableProps {
  coins: CoinRow[];
  loading?: boolean;
  onRowClick?: (coin: CoinRow) => void;
}

// ═══════════════════════════════════════════════════════════════
// 🎨 HELPERS
// ═══════════════════════════════════════════════════════════════
function formatPrice(price: number | null): string {
  if (price === null || price === undefined) return "—";
  if (price >= 1) return `$${price.toFixed(2)}`;
  if (price >= 0.01) return `$${price.toFixed(4)}`;
  if (price >= 0.0001) return `$${price.toFixed(6)}`;
  return `$${price.toExponential(2)}`;
}

function formatLargeNumber(value: number | null): string {
  if (value === null || value === undefined) return "—";
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

function getTierConfig(tier: CoinRow["tier"]) {
  const configs = {
    excellent: {
      bg: "bg-emerald-500/10",
      text: "text-emerald-400",
      border: "border-emerald-500/20",
      label: "ممتاز",
    },
    good: {
      bg: "bg-blue-500/10",
      text: "text-blue-400",
      border: "border-blue-500/20",
      label: "جيد",
    },
    average: {
      bg: "bg-amber-500/10",
      text: "text-amber-400",
      border: "border-amber-500/20",
      label: "متوسط",
    },
    poor: {
      bg: "bg-orange-500/10",
      text: "text-orange-400",
      border: "border-orange-500/20",
      label: "ضعيف",
    },
    avoid: {
      bg: "bg-red-500/10",
      text: "text-red-400",
      border: "border-red-500/20",
      label: "تجنب",
    },
  };
  return configs[tier];
}

function getCoinInitial(symbol: string): string {
  return symbol.charAt(0).toUpperCase();
}

function getCoinColor(symbol: string): string {
  const colors = [
    "from-blue-500 to-blue-700",
    "from-purple-500 to-purple-700",
    "from-emerald-500 to-emerald-700",
    "from-pink-500 to-pink-700",
    "from-amber-500 to-amber-700",
    "from-cyan-500 to-cyan-700",
    "from-rose-500 to-rose-700",
    "from-indigo-500 to-indigo-700",
  ];
  const hash = symbol.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return colors[hash % colors.length];
}

// ═══════════════════════════════════════════════════════════════
// 📊 PRICE CHANGE INDICATOR
// ═══════════════════════════════════════════════════════════════
function PriceChange({ change }: { change: number | null }) {
  if (change === null || change === undefined) {
    return <span className="text-slate-500">—</span>;
  }

  const isPositive = change > 0;
  const isNeutral = change === 0;
  const Icon = isNeutral ? Minus : isPositive ? TrendingUp : TrendingDown;
  const colorClass = isNeutral
    ? "text-slate-400"
    : isPositive
      ? "text-emerald-400"
      : "text-red-400";

  return (
    <div className={`inline-flex items-center gap-1 ${colorClass} font-medium tabular-nums`}>
      <Icon className="w-3 h-3" strokeWidth={2.5} />
      <span>
        {isPositive && "+"}
        {change.toFixed(2)}%
      </span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 🎯 SCORE BADGE
// ═══════════════════════════════════════════════════════════════
function ScoreBadge({ score, tier }: { score: number; tier: CoinRow["tier"] }) {
  const config = getTierConfig(tier);

  return (
    <div
      className={`
        inline-flex items-center gap-1.5 px-2.5 py-1
        ${config.bg} ${config.text} ${config.border}
        border rounded-lg
        font-bold text-sm tabular-nums
      `}
    >
      <span>{score}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 📊 MAIN TABLE
// ═══════════════════════════════════════════════════════════════
type SortColumn = "score" | "price" | "marketCap" | "volume" | "change";

export function CoinTable({ coins, loading, onRowClick }: CoinTableProps) {
  const [sortColumn, setSortColumn] = useState<SortColumn>("score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Sort coins
  const sortedCoins = [...coins].sort((a, b) => {
    let aVal = 0;
    let bVal = 0;

    switch (sortColumn) {
      case "score":
        aVal = a.score;
        bVal = b.score;
        break;
      case "price":
        aVal = a.price ?? 0;
        bVal = b.price ?? 0;
        break;
      case "marketCap":
        aVal = a.marketCap ?? 0;
        bVal = b.marketCap ?? 0;
        break;
      case "volume":
        aVal = a.volume24h ?? 0;
        bVal = b.volume24h ?? 0;
        break;
      case "change":
        aVal = a.priceChange24h ?? 0;
        bVal = b.priceChange24h ?? 0;
        break;
    }

    return sortDir === "desc" ? bVal - aVal : aVal - bVal;
  });

  function toggleSort(col: SortColumn) {
    if (sortColumn === col) {
      setSortDir(sortDir === "desc" ? "asc" : "desc");
    } else {
      setSortColumn(col);
      setSortDir("desc");
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="bg-[#0d0d14]/60 backdrop-blur-xl border border-white/[0.06] rounded-xl overflow-hidden">
        <div className="p-12 text-center text-slate-500">
          <div className="inline-block w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mb-3" />
          <div className="text-sm">جاري التحميل...</div>
        </div>
      </div>
    );
  }

  // Empty state
  if (coins.length === 0) {
    return (
      <div className="bg-[#0d0d14]/60 backdrop-blur-xl border border-white/[0.06] rounded-xl overflow-hidden">
        <div className="p-12 text-center text-slate-500">
          <div className="text-sm">لا توجد عملات للعرض</div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#0d0d14]/60 backdrop-blur-xl border border-white/[0.06] rounded-xl overflow-hidden">
      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          {/* Header */}
          <thead>
            <tr className="border-b border-white/[0.06] bg-white/[0.02]">
              <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-widest w-12">
                #
              </th>
              <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                العملة
              </th>
              <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                الخوارزمية
              </th>
              <th
                className="px-4 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-widest cursor-pointer hover:text-slate-300 transition-colors"
                onClick={() => toggleSort("score")}
              >
                <div className="inline-flex items-center gap-1">
                  النقاط
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th
                className="px-4 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-widest cursor-pointer hover:text-slate-300 transition-colors"
                onClick={() => toggleSort("price")}
              >
                <div className="inline-flex items-center gap-1">
                  السعر
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th
                className="px-4 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-widest cursor-pointer hover:text-slate-300 transition-colors"
                onClick={() => toggleSort("change")}
              >
                <div className="inline-flex items-center gap-1">
                  24س
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th
                className="px-4 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-widest cursor-pointer hover:text-slate-300 transition-colors"
                onClick={() => toggleSort("marketCap")}
              >
                <div className="inline-flex items-center gap-1">
                  Market Cap
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th
                className="px-4 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-widest cursor-pointer hover:text-slate-300 transition-colors"
                onClick={() => toggleSort("volume")}
              >
                <div className="inline-flex items-center gap-1">
                  حجم 24س
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                VRAM
              </th>
              <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                التصنيف
              </th>
            </tr>
          </thead>

          {/* Body */}
          <tbody>
            {sortedCoins.map((coin, index) => {
              const tierConfig = getTierConfig(coin.tier);

              return (
                <tr
                  key={coin.symbol}
                  onClick={() => onRowClick?.(coin)}
                  className={`
                    border-b border-white/[0.04] last:border-b-0
                    hover:bg-white/[0.02]
                    transition-colors duration-150
                    ${onRowClick ? "cursor-pointer" : ""}
                    group
                  `}
                >
                  {/* # Index */}
                  <td className="px-4 py-3.5 text-slate-500 text-sm font-medium tabular-nums">
                    {index + 1}
                  </td>

                  {/* Coin */}
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      {/* Coin avatar */}
                      <div
                        className={`
                          w-9 h-9 rounded-full
                          bg-gradient-to-br ${getCoinColor(coin.symbol)}
                          flex items-center justify-center
                          text-white font-bold text-sm
                          shadow-lg
                          shrink-0
                        `}
                      >
                        {getCoinInitial(coin.symbol)}
                      </div>

                      {/* Name + Symbol */}
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white truncate">
                          {coin.name}
                        </div>
                        <div className="text-xs text-slate-500 font-medium">
                          {coin.symbol}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Algorithm */}
                  <td className="px-4 py-3.5">
                    <div className="inline-flex items-center gap-1.5 text-xs text-slate-400 font-mono">
                      <Cpu className="w-3 h-3 text-slate-600" />
                      {coin.algorithm}
                    </div>
                  </td>

                  {/* Score */}
                  <td className="px-4 py-3.5">
                    <ScoreBadge score={coin.score} tier={coin.tier} />
                  </td>

                  {/* Price */}
                  <td className="px-4 py-3.5 text-sm text-white font-medium tabular-nums">
                    {formatPrice(coin.price)}
                  </td>

                  {/* 24h Change */}
                  <td className="px-4 py-3.5 text-sm">
                    <PriceChange change={coin.priceChange24h} />
                  </td>

                  {/* Market Cap */}
                  <td className="px-4 py-3.5 text-sm text-slate-300 font-medium tabular-nums">
                    {formatLargeNumber(coin.marketCap)}
                  </td>

                  {/* Volume */}
                  <td className="px-4 py-3.5 text-sm text-slate-400 tabular-nums">
                    {formatLargeNumber(coin.volume24h)}
                  </td>

                  {/* VRAM */}
                  <td className="px-4 py-3.5">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-white/[0.04] text-slate-400 text-xs font-medium">
                      {coin.minVramGB ? `${coin.minVramGB}GB` : "—"}
                    </span>
                  </td>

                  {/* Tier */}
                  <td className="px-4 py-3.5">
                    <span
                      className={`
                        inline-flex items-center px-2 py-1
                        ${tierConfig.bg} ${tierConfig.text} ${tierConfig.border}
                        border rounded-md
                        text-xs font-semibold
                      `}
                    >
                      {tierConfig.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-white/[0.06] bg-white/[0.02]">
        <div className="text-xs text-slate-500 flex items-center justify-between">
          <span>
            عرض <span className="text-slate-300 font-medium">{coins.length}</span> عملة
          </span>
          <div className="flex items-center gap-1.5 text-slate-600">
            <ExternalLink className="w-3 h-3" />
            <span>اضغط على الصف لمزيد من التفاصيل</span>
          </div>
        </div>
      </div>
    </div>
  );
}