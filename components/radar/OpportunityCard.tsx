"use client";

import {
  CheckCircle2,
  AlertTriangle,
  Target,
  Users,
  Clock,
  ChevronDown,
  ChevronUp,
  Shield,
} from "lucide-react";
import { useState } from "react";

// ═══════════════════════════════════════════════════════════════
// 💎 OPPORTUNITY CARD
// ═══════════════════════════════════════════════════════════════

export interface OpportunityData {
  kind: "hidden_gem" | "pump_alert" | "dead_coin" | "new_listing";
  emoji: string;
  title: string;
  signal: string;
  reasoning: string[];
  risks: string[];
  riskLevel: "low" | "medium" | "high" | "extreme";
  audience: "beginner" | "intermediate" | "expert";
  timeframe: "short" | "medium" | "long";
  confidence: number;
  score: number;
  coinSymbol: string;
  coinName: string;
}

interface OpportunityCardProps {
  opportunity: OpportunityData;
  expanded?: boolean;
}

// ═══════════════════════════════════════════════════════════════
// 🎨 CONFIG HELPERS
// ═══════════════════════════════════════════════════════════════
function getKindConfig(kind: OpportunityData["kind"]) {
  const configs = {
    hidden_gem: {
      gradient: "from-emerald-500/20 via-emerald-500/5 to-transparent",
      border: "border-emerald-500/30",
      accent: "bg-emerald-500",
      text: "text-emerald-400",
      glow: "shadow-emerald-500/20",
      label: "جوهرة مخفية",
    },
    pump_alert: {
      gradient: "from-amber-500/20 via-amber-500/5 to-transparent",
      border: "border-amber-500/30",
      accent: "bg-amber-500",
      text: "text-amber-400",
      glow: "shadow-amber-500/20",
      label: "ارتفاع قوي",
    },
    dead_coin: {
      gradient: "from-red-500/20 via-red-500/5 to-transparent",
      border: "border-red-500/30",
      accent: "bg-red-500",
      text: "text-red-400",
      glow: "shadow-red-500/20",
      label: "تحذير",
    },
    new_listing: {
      gradient: "from-blue-500/20 via-blue-500/5 to-transparent",
      border: "border-blue-500/30",
      accent: "bg-blue-500",
      text: "text-blue-400",
      glow: "shadow-blue-500/20",
      label: "جديدة",
    },
  };
  return configs[kind];
}

function getRiskConfig(level: OpportunityData["riskLevel"]) {
  const configs = {
    low: {
      bg: "bg-emerald-500/10",
      text: "text-emerald-400",
      border: "border-emerald-500/20",
      label: "مخاطر منخفضة",
    },
    medium: {
      bg: "bg-amber-500/10",
      text: "text-amber-400",
      border: "border-amber-500/20",
      label: "مخاطر متوسطة",
    },
    high: {
      bg: "bg-orange-500/10",
      text: "text-orange-400",
      border: "border-orange-500/20",
      label: "مخاطر عالية",
    },
    extreme: {
      bg: "bg-red-500/10",
      text: "text-red-400",
      border: "border-red-500/20",
      label: "مخاطر شديدة",
    },
  };
  return configs[level];
}

function getAudienceLabel(aud: OpportunityData["audience"]): string {
  const labels = {
    beginner: "للمبتدئين",
    intermediate: "للمتوسطين",
    expert: "للخبراء",
  };
  return labels[aud];
}

function getTimeframeLabel(tf: OpportunityData["timeframe"]): string {
  const labels = {
    short: "قصير المدى",
    medium: "متوسط المدى",
    long: "طويل المدى",
  };
  return labels[tf];
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

// ═══════════════════════════════════════════════════════════════
// 💎 MAIN CARD
// ═══════════════════════════════════════════════════════════════
export function OpportunityCard({
  opportunity,
  expanded: initialExpanded = false,
}: OpportunityCardProps) {
  const [isExpanded, setIsExpanded] = useState(initialExpanded);

  const kindConfig = getKindConfig(opportunity.kind);
  const riskConfig = getRiskConfig(opportunity.riskLevel);

  return (
    <div
      className={`
        group relative
        bg-[#0d0d14]/80 backdrop-blur-xl
        border ${kindConfig.border}
        rounded-xl overflow-hidden
        hover:shadow-xl hover:${kindConfig.glow}
        transition-all duration-300
      `}
    >
      {/* Gradient overlay */}
      <div
        className={`
          absolute inset-0 bg-gradient-to-br ${kindConfig.gradient}
          opacity-50 pointer-events-none
        `}
      />

      {/* Top accent bar */}
      <div className={`absolute top-0 left-0 right-0 h-0.5 ${kindConfig.accent}`} />

      {/* ═══════════════════════════════════════════════════════ */}
      {/* HEADER                                                    */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div className="relative p-5">
        <div className="flex items-start gap-4">
          {/* Emoji + Coin avatar */}
          <div className="relative shrink-0">
            <div
              className={`
                w-14 h-14 rounded-2xl
                bg-gradient-to-br ${getCoinColor(opportunity.coinSymbol)}
                flex items-center justify-center
                text-white font-bold text-lg
                shadow-lg
              `}
            >
              {opportunity.coinSymbol.charAt(0)}
            </div>
            {/* Emoji badge */}
            <div
              className="
                absolute -top-1 -right-1
                w-7 h-7 rounded-full
                bg-[#0a0a0f] border-2 border-[#0d0d14]
                flex items-center justify-center
                text-base
              "
            >
              {opportunity.emoji}
            </div>
          </div>

          {/* Title + signal */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span
                className={`
                  text-[10px] font-bold uppercase tracking-widest
                  ${kindConfig.text}
                `}
              >
                {kindConfig.label}
              </span>
              <span className="text-slate-700">•</span>
              <span className="text-[10px] font-medium text-slate-500">
                {opportunity.coinSymbol}
              </span>
            </div>

            <h3 className="text-base font-bold text-white mb-1.5 leading-tight">
              {opportunity.title}
            </h3>

            <p className="text-sm text-slate-400 leading-relaxed">
              {opportunity.signal}
            </p>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* METRICS BAR                                               */}
        {/* ═══════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-3 gap-2 mt-4">
          {/* Confidence */}
          <div className="bg-white/[0.03] border border-white/[0.04] rounded-lg p-2.5">
            <div className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
              الثقة
            </div>
            <div className="flex items-baseline gap-1">
              <span className={`text-lg font-bold ${kindConfig.text} tabular-nums`}>
                {opportunity.confidence}
              </span>
              <span className="text-xs text-slate-500">%</span>
            </div>
          </div>

          {/* Score */}
          <div className="bg-white/[0.03] border border-white/[0.04] rounded-lg p-2.5">
            <div className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
              النقاط
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-bold text-white tabular-nums">
                {opportunity.score}
              </span>
              <span className="text-xs text-slate-500">/100</span>
            </div>
          </div>

          {/* Risk */}
          <div
            className={`
              ${riskConfig.bg} ${riskConfig.border}
              border rounded-lg p-2.5
            `}
          >
            <div className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
              المخاطر
            </div>
            <div className="flex items-center gap-1">
              <Shield className={`w-3.5 h-3.5 ${riskConfig.text}`} strokeWidth={2.5} />
              <span className={`text-xs font-bold ${riskConfig.text}`}>
                {opportunity.riskLevel === "low" && "منخفضة"}
                {opportunity.riskLevel === "medium" && "متوسطة"}
                {opportunity.riskLevel === "high" && "عالية"}
                {opportunity.riskLevel === "extreme" && "شديدة"}
              </span>
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* TAGS                                                      */}
        {/* ═══════════════════════════════════════════════════════ */}
        <div className="flex items-center gap-2 mt-3">
          <div className="inline-flex items-center gap-1 px-2 py-1 bg-white/[0.04] border border-white/[0.04] rounded-md text-[10px] text-slate-400">
            <Users className="w-3 h-3" />
            {getAudienceLabel(opportunity.audience)}
          </div>
          <div className="inline-flex items-center gap-1 px-2 py-1 bg-white/[0.04] border border-white/[0.04] rounded-md text-[10px] text-slate-400">
            <Clock className="w-3 h-3" />
            {getTimeframeLabel(opportunity.timeframe)}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* EXPANDABLE DETAILS                                        */}
      {/* ═══════════════════════════════════════════════════════ */}
      {isExpanded && (
        <div className="relative border-t border-white/[0.06] p-5 space-y-4">
          {/* Reasoning */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                الأسباب
              </h4>
            </div>
            <ul className="space-y-1.5">
              {opportunity.reasoning.map((reason, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-slate-300 leading-relaxed">
                  <span className="text-emerald-500 mt-1">▸</span>
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Risks */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                المخاطر
              </h4>
            </div>
            <ul className="space-y-1.5">
              {opportunity.risks.map((risk, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-slate-400 leading-relaxed">
                  <span className="text-amber-500 mt-1">▸</span>
                  <span>{risk}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* FOOTER (Toggle button)                                    */}
      {/* ═══════════════════════════════════════════════════════ */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="
          relative w-full px-5 py-2.5
          border-t border-white/[0.06]
          bg-white/[0.02] hover:bg-white/[0.04]
          flex items-center justify-center gap-2
          text-xs font-medium text-slate-400 hover:text-slate-300
          transition-colors
        "
      >
        {isExpanded ? (
          <>
            <span>إخفاء التفاصيل</span>
            <ChevronUp className="w-3.5 h-3.5" />
          </>
        ) : (
          <>
            <span>عرض التفاصيل</span>
            <ChevronDown className="w-3.5 h-3.5" />
          </>
        )}
      </button>
    </div>
  );
}