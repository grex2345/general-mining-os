// ═══════════════════════════════════════════════════════════════
// 🎯 RADAR ENGINE - PUBLIC API
// الواجهة الموحدة لكل وظائف المحرك
// ═══════════════════════════════════════════════════════════════

// ───────────────────────────────────────────────────────────────
// 📊 Scoring Engine
// ───────────────────────────────────────────────────────────────
export {
  calculateScore,
  calculateBatchScores,
  tierLabel,
  tierColor,
  tierEmoji,
  SCORING_WEIGHTS,
} from "./scoring";

export type {
  ScoreTier,
  ScoreBreakdown,
  ScoredCoin,
} from "./scoring";

// ───────────────────────────────────────────────────────────────
// 🔍 Opportunity Detector
// ───────────────────────────────────────────────────────────────
export {
  detectOpportunities,
  detectAllOpportunities,
  opportunityKindLabel,
  riskLevelLabel,
  riskLevelColor,
  audienceLabel,
  timeframeLabel,
} from "./detector";

export type {
  OpportunityKind,
  RiskLevel,
  Audience,
  Timeframe,
  DetectedOpportunity,
} from "./detector";

// ═══════════════════════════════════════════════════════════════
// 🚀 HIGH-LEVEL HELPERS
// دوال جاهزة تستخدم في APIs و UI
// ═══════════════════════════════════════════════════════════════

import type { MineableCoinData } from "../types";
import { calculateBatchScores, type ScoredCoin } from "./scoring";
import {
  detectAllOpportunities,
  type DetectedOpportunity,
} from "./detector";

// ───────────────────────────────────────────────────────────────
// 📊 RADAR ANALYSIS RESULT
// النتيجة الشاملة لتحليل العملات
// ───────────────────────────────────────────────────────────────
export interface RadarAnalysis {
  // كل العملات مع scores
  scoredCoins: ScoredCoin[];

  // الفرص المكتشفة
  opportunities: DetectedOpportunity[];

  // إحصائيات سريعة
  stats: {
    totalCoins: number;
    excellentCount: number;
    goodCount: number;
    averageCount: number;
    poorCount: number;
    avoidCount: number;

    totalOpportunities: number;
    hiddenGems: number;
    pumpAlerts: number;
    deadCoins: number;
    newListings: number;

    averageScore: number;
    topScore: number;
  };

  // أفضل 5 عملات
  top5Coins: ScoredCoin[];

  // أعلى 5 فرص (بالـ confidence)
  top5Opportunities: DetectedOpportunity[];
}

// ───────────────────────────────────────────────────────────────
// 🎯 MAIN ANALYZER
// الدالة الرئيسية - تحليل كامل لقائمة عملات
// ───────────────────────────────────────────────────────────────
export function analyzeRadar(coins: MineableCoinData[]): RadarAnalysis {
  // 1. حساب scores لكل العملات (مرتبة من الأعلى للأدنى)
  const scoredCoins = calculateBatchScores(coins);

  // 2. كشف كل الفرص
  const opportunities = detectAllOpportunities(coins);

  // 3. حساب الإحصائيات
  const stats = {
    totalCoins: scoredCoins.length,
    excellentCount: scoredCoins.filter((s) => s.score.tier === "excellent").length,
    goodCount: scoredCoins.filter((s) => s.score.tier === "good").length,
    averageCount: scoredCoins.filter((s) => s.score.tier === "average").length,
    poorCount: scoredCoins.filter((s) => s.score.tier === "poor").length,
    avoidCount: scoredCoins.filter((s) => s.score.tier === "avoid").length,

    totalOpportunities: opportunities.length,
    hiddenGems: opportunities.filter((o) => o.kind === "hidden_gem").length,
    pumpAlerts: opportunities.filter((o) => o.kind === "pump_alert").length,
    deadCoins: opportunities.filter((o) => o.kind === "dead_coin").length,
    newListings: opportunities.filter((o) => o.kind === "new_listing").length,

    averageScore:
      scoredCoins.length > 0
        ? Math.round(
            scoredCoins.reduce((sum, s) => sum + s.score.total, 0) /
              scoredCoins.length
          )
        : 0,
    topScore: scoredCoins.length > 0 ? scoredCoins[0].score.total : 0,
  };

  // 4. Top 5 من كل نوع
  const top5Coins = scoredCoins.slice(0, 5);
  const top5Opportunities = opportunities.slice(0, 5);

  return {
    scoredCoins,
    opportunities,
    stats,
    top5Coins,
    top5Opportunities,
  };
}

// ───────────────────────────────────────────────────────────────
// 🔍 FILTER HELPERS
// دوال فلترة جاهزة
// ───────────────────────────────────────────────────────────────

/**
 * فلترة عملات حسب الـ tier
 */
export function filterByTier(
  scoredCoins: ScoredCoin[],
  tiers: ("excellent" | "good" | "average" | "poor" | "avoid")[]
): ScoredCoin[] {
  return scoredCoins.filter((s) => tiers.includes(s.score.tier));
}

/**
 * فلترة عملات حسب VRAM
 */
export function filterByVram(
  scoredCoins: ScoredCoin[],
  maxVramGB: number
): ScoredCoin[] {
  return scoredCoins.filter((s) => {
    const vram = s.coin.minVramGB ?? 999;
    return vram <= maxVramGB;
  });
}

/**
 * فلترة عملات حسب الخوارزمية
 */
export function filterByAlgorithm(
  scoredCoins: ScoredCoin[],
  algorithms: string[]
): ScoredCoin[] {
  return scoredCoins.filter((s) => algorithms.includes(s.coin.algorithm));
}

/**
 * فلترة فرص حسب النوع
 */
export function filterOpportunitiesByKind(
  opportunities: DetectedOpportunity[],
  kinds: ("hidden_gem" | "pump_alert" | "dead_coin" | "new_listing")[]
): DetectedOpportunity[] {
  return opportunities.filter((o) => kinds.includes(o.kind));
}

/**
 * فلترة فرص حسب مستوى الخطورة
 */
export function filterOpportunitiesByRisk(
  opportunities: DetectedOpportunity[],
  maxRisk: "low" | "medium" | "high" | "extreme"
): DetectedOpportunity[] {
  const riskOrder = { low: 1, medium: 2, high: 3, extreme: 4 };
  const maxLevel = riskOrder[maxRisk];

  return opportunities.filter((o) => riskOrder[o.riskLevel] <= maxLevel);
}

/**
 * فلترة فرص حسب الجمهور
 */
export function filterOpportunitiesByAudience(
  opportunities: DetectedOpportunity[],
  audience: "beginner" | "intermediate" | "expert"
): DetectedOpportunity[] {
  return opportunities.filter((o) => o.audience === audience);
}

// ───────────────────────────────────────────────────────────────
// 🔎 SEARCH
// ───────────────────────────────────────────────────────────────
export function searchCoins(
  scoredCoins: ScoredCoin[],
  query: string
): ScoredCoin[] {
  const q = query.toLowerCase().trim();

  if (!q) return scoredCoins;

  return scoredCoins.filter(
    (s) =>
      s.coin.symbol.toLowerCase().includes(q) ||
      s.coin.name.toLowerCase().includes(q) ||
      s.coin.algorithm.toLowerCase().includes(q)
  );
}

// ───────────────────────────────────────────────────────────────
// 📈 SORT HELPERS
// ───────────────────────────────────────────────────────────────
export type SortBy =
  | "score"
  | "marketCap"
  | "volume"
  | "priceChange"
  | "name";

export type SortDirection = "asc" | "desc";

export function sortCoins(
  scoredCoins: ScoredCoin[],
  sortBy: SortBy,
  direction: SortDirection = "desc"
): ScoredCoin[] {
  const sorted = [...scoredCoins].sort((a, b) => {
    let aVal: number | string;
    let bVal: number | string;

    switch (sortBy) {
      case "score":
        aVal = a.score.total;
        bVal = b.score.total;
        break;
      case "marketCap":
        aVal = a.coin.marketCap ?? 0;
        bVal = b.coin.marketCap ?? 0;
        break;
      case "volume":
        aVal = a.coin.volume24h ?? 0;
        bVal = b.coin.volume24h ?? 0;
        break;
      case "priceChange":
        aVal = a.coin.priceChange24h ?? 0;
        bVal = b.coin.priceChange24h ?? 0;
        break;
      case "name":
        aVal = a.coin.name.toLowerCase();
        bVal = b.coin.name.toLowerCase();
        break;
      default:
        return 0;
    }

    if (typeof aVal === "string" && typeof bVal === "string") {
      return direction === "asc"
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal);
    }

    return direction === "asc"
      ? (aVal as number) - (bVal as number)
      : (bVal as number) - (aVal as number);
  });

  return sorted;
}