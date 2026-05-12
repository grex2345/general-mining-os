// ═══════════════════════════════════════════════════════════════
// 🧠 SCORING ENGINE
// يحسب نقاط (score) لكل عملة من 0 إلى 100
// بناءً على: liquidity, volume, price change, market cap, etc.
// ═══════════════════════════════════════════════════════════════

import type { MineableCoinData } from "../types";

// ═══════════════════════════════════════════════════════════════
// 📊 SCORING WEIGHTS
// إجمالي الأوزان = 100%
// ═══════════════════════════════════════════════════════════════
export const SCORING_WEIGHTS = {
  liquidity: 0.25,        // 25% - السيولة
  volume: 0.20,           // 20% - حجم التداول
  priceChange: 0.15,      // 15% - التغير السعري
  marketCap: 0.15,        // 15% - حجم العملة
  reliability: 0.15,      // 15% - موثوقية البيانات
  miningDifficulty: 0.10, // 10% - تعقيد التعدين
} as const;

// ═══════════════════════════════════════════════════════════════
// 🎯 SCORE TIERS
// ═══════════════════════════════════════════════════════════════
export type ScoreTier = "excellent" | "good" | "average" | "poor" | "avoid";

export interface ScoreBreakdown {
  total: number;              // النتيجة النهائية (0-100)
  tier: ScoreTier;            // التصنيف
  factors: {
    liquidity: number;        // 0-100
    volume: number;           // 0-100
    priceChange: number;      // 0-100
    marketCap: number;        // 0-100
    reliability: number;      // 0-100
    miningDifficulty: number; // 0-100
  };
  strengths: string[];        // نقاط القوة
  weaknesses: string[];       // نقاط الضعف
}

// ═══════════════════════════════════════════════════════════════
// 🧮 INDIVIDUAL FACTOR SCORERS
// كل دالة ترجع قيمة بين 0-100
// ═══════════════════════════════════════════════════════════════

/**
 * 💧 Liquidity Score (0-100)
 * يعتمد على: liquidityScore + listingCount
 */
function scoreLiquidity(coin: MineableCoinData): number {
  const liquidityScore = coin.liquidityScore ?? 0;
  const listingCount = coin.listingCount ?? 0;

  // liquidityScore weight: 70%
  const liquidityPart = Math.min(100, liquidityScore) * 0.7;

  // listingCount weight: 30%
  // 30+ listings = 100 points
  const listingPart = Math.min(100, (listingCount / 30) * 100) * 0.3;

  return Math.round(liquidityPart + listingPart);
}

/**
 * 📈 Volume Score (0-100)
 * يعتمد على: volume24h
 * Logarithmic scale (since volume varies hugely)
 */
function scoreVolume(coin: MineableCoinData): number {
  const volume = coin.volume24h ?? 0;

  if (volume <= 0) return 0;
  if (volume >= 100_000_000) return 100;  // $100M+ = perfect

  // Log scale: $10K = 20, $100K = 40, $1M = 60, $10M = 80, $100M = 100
  const logVolume = Math.log10(volume);
  const score = Math.max(0, ((logVolume - 4) / 4) * 100);

  return Math.round(Math.min(100, score));
}

/**
 * ⚡ Price Change Score (0-100)
 * يعتمد على: priceChange24h
 * +5% to +20% = best zone
 * Negative = bad, but not zero
 */
function scorePriceChange(coin: MineableCoinData): number {
  const change = coin.priceChange24h ?? 0;

  // Sweet spot: +5% to +20%
  if (change >= 5 && change <= 20) return 100;

  // Pump warning: too high (>50%)
  if (change > 50) return 40;

  // Moderate gains
  if (change > 0 && change < 5) return 60 + change * 4; // 60-80

  // Big gains (20-50%)
  if (change > 20 && change <= 50) return 100 - (change - 20) * 2; // 100-40

  // Slight loss (-5% to 0%)
  if (change < 0 && change >= -5) return 50 + change * 4; // 30-50

  // Moderate loss (-15% to -5%)
  if (change < -5 && change >= -15) return 30 + (change + 5) * 2; // 10-30

  // Heavy loss
  return 10;
}

/**
 * 💎 Market Cap Score (0-100)
 * Best zone: $50M - $500M (small/mid cap with growth potential)
 */
function scoreMarketCap(coin: MineableCoinData): number {
  const mcap = coin.marketCap ?? 0;

  if (mcap <= 0) return 0;

  // Sweet spot: $50M - $500M
  if (mcap >= 50_000_000 && mcap <= 500_000_000) return 100;

  // Micro cap (< $1M) = high risk
  if (mcap < 1_000_000) return 20;

  // Small cap ($1M - $50M) = good
  if (mcap < 50_000_000) {
    const ratio = (mcap - 1_000_000) / 49_000_000;
    return Math.round(40 + ratio * 50); // 40-90
  }

  // Large cap ($500M - $5B)
  if (mcap > 500_000_000 && mcap <= 5_000_000_000) {
    const ratio = (mcap - 500_000_000) / 4_500_000_000;
    return Math.round(80 - ratio * 30); // 80-50
  }

  // Mega cap (> $5B) = limited upside
  return 40;
}

/**
 * 🎯 Reliability Score (0-100)
 * Based on data quality
 */
function scoreReliability(coin: MineableCoinData): number {
  switch (coin.reliability) {
    case "high":
      return 100;
    case "medium":
      return 60;
    case "low":
      return 30;
    default:
      return 50;
  }
}

/**
 * ⛏️ Mining Difficulty Score (0-100)
 * Lower difficulty + lower VRAM = better for new miners
 */
function scoreMiningDifficulty(coin: MineableCoinData): number {
  const minVram = coin.minVramGB ?? 8;

  // VRAM score: less = better
  // 2GB = 100, 4GB = 80, 6GB = 60, 8GB = 40, 12GB+ = 20
  let vramScore = 100;
  if (minVram <= 2) vramScore = 100;
  else if (minVram <= 3) vramScore = 90;
  else if (minVram <= 4) vramScore = 80;
  else if (minVram <= 6) vramScore = 60;
  else if (minVram <= 8) vramScore = 40;
  else vramScore = 20;

  return vramScore;
}

// ═══════════════════════════════════════════════════════════════
// 🎯 TIER CLASSIFIER
// ═══════════════════════════════════════════════════════════════
function classifyTier(score: number): ScoreTier {
  if (score >= 80) return "excellent";
  if (score >= 60) return "good";
  if (score >= 40) return "average";
  if (score >= 20) return "poor";
  return "avoid";
}

// ═══════════════════════════════════════════════════════════════
// 💪 STRENGTHS & WEAKNESSES DETECTOR
// ═══════════════════════════════════════════════════════════════
function detectStrengths(factors: ScoreBreakdown["factors"]): string[] {
  const strengths: string[] = [];

  if (factors.liquidity >= 80) strengths.push("سيولة ممتازة");
  if (factors.volume >= 80) strengths.push("حجم تداول قوي");
  if (factors.priceChange >= 80) strengths.push("حركة سعرية إيجابية");
  if (factors.marketCap >= 80) strengths.push("حجم سوقي مثالي");
  if (factors.reliability >= 80) strengths.push("بيانات موثوقة");
  if (factors.miningDifficulty >= 80) strengths.push("سهلة التعدين");

  return strengths;
}

function detectWeaknesses(factors: ScoreBreakdown["factors"]): string[] {
  const weaknesses: string[] = [];

  if (factors.liquidity < 40) weaknesses.push("سيولة ضعيفة");
  if (factors.volume < 40) weaknesses.push("حجم تداول منخفض");
  if (factors.priceChange < 40) weaknesses.push("ضعف في الحركة السعرية");
  if (factors.marketCap < 40) weaknesses.push("حجم سوقي خارج النطاق المثالي");
  if (factors.reliability < 40) weaknesses.push("بيانات غير موثوقة");
  if (factors.miningDifficulty < 40) weaknesses.push("متطلبات تعدين عالية");

  return weaknesses;
}

// ═══════════════════════════════════════════════════════════════
// 🚀 MAIN SCORING FUNCTION
// ═══════════════════════════════════════════════════════════════
export function calculateScore(coin: MineableCoinData): ScoreBreakdown {
  // Calculate individual factors
  const factors = {
    liquidity: scoreLiquidity(coin),
    volume: scoreVolume(coin),
    priceChange: scorePriceChange(coin),
    marketCap: scoreMarketCap(coin),
    reliability: scoreReliability(coin),
    miningDifficulty: scoreMiningDifficulty(coin),
  };

  // Calculate weighted total
  const total = Math.round(
    factors.liquidity * SCORING_WEIGHTS.liquidity +
    factors.volume * SCORING_WEIGHTS.volume +
    factors.priceChange * SCORING_WEIGHTS.priceChange +
    factors.marketCap * SCORING_WEIGHTS.marketCap +
    factors.reliability * SCORING_WEIGHTS.reliability +
    factors.miningDifficulty * SCORING_WEIGHTS.miningDifficulty
  );

  return {
    total,
    tier: classifyTier(total),
    factors,
    strengths: detectStrengths(factors),
    weaknesses: detectWeaknesses(factors),
  };
}

// ═══════════════════════════════════════════════════════════════
// 📊 BATCH SCORING
// تحسب scores لعدة عملات دفعة واحدة، مرتبة من الأعلى للأدنى
// ═══════════════════════════════════════════════════════════════
export interface ScoredCoin {
  coin: MineableCoinData;
  score: ScoreBreakdown;
}

export function calculateBatchScores(coins: MineableCoinData[]): ScoredCoin[] {
  const scored = coins.map((coin) => ({
    coin,
    score: calculateScore(coin),
  }));

  // Sort by total score (descending)
  return scored.sort((a, b) => b.score.total - a.score.total);
}

// ═══════════════════════════════════════════════════════════════
// 🎨 TIER UTILITIES (for UI)
// ═══════════════════════════════════════════════════════════════
export function tierLabel(tier: ScoreTier): string {
  const labels: Record<ScoreTier, string> = {
    excellent: "ممتاز",
    good: "جيد",
    average: "متوسط",
    poor: "ضعيف",
    avoid: "تجنب",
  };
  return labels[tier];
}

export function tierColor(tier: ScoreTier): string {
  const colors: Record<ScoreTier, string> = {
    excellent: "#10b981", // green
    good: "#3b82f6",      // blue
    average: "#f59e0b",   // amber
    poor: "#f97316",      // orange
    avoid: "#ef4444",     // red
  };
  return colors[tier];
}

export function tierEmoji(tier: ScoreTier): string {
  const emojis: Record<ScoreTier, string> = {
    excellent: "⭐",
    good: "✅",
    average: "⚠️",
    poor: "❌",
    avoid: "💀",
  };
  return emojis[tier];
}