// ═══════════════════════════════════════════════════════════════
// 🔍 OPPORTUNITY DETECTOR
// يكتشف الفرص الذهبية في العملات
// 4 أنواع: Hidden Gem, Pump Alert, Dead Coin, New Listing
// ═══════════════════════════════════════════════════════════════

import type { MineableCoinData } from "../types";
import { calculateScore, type ScoreBreakdown } from "./scoring";

// ═══════════════════════════════════════════════════════════════
// 🎯 OPPORTUNITY TYPES
// ═══════════════════════════════════════════════════════════════
export type OpportunityKind =
  | "hidden_gem"
  | "pump_alert"
  | "dead_coin"
  | "new_listing";

export type RiskLevel = "low" | "medium" | "high" | "extreme";

export type Audience = "beginner" | "intermediate" | "expert";

export type Timeframe = "short" | "medium" | "long";

export interface DetectedOpportunity {
  kind: OpportunityKind;
  emoji: string;
  title: string;              // عنوان عربي
  signal: string;             // الإشارة الرئيسية
  reasoning: string[];        // الأسباب
  risks: string[];            // المخاطر
  riskLevel: RiskLevel;
  audience: Audience;
  timeframe: Timeframe;
  confidence: number;         // 0-100
  score: number;              // النتيجة الإجمالية
  coinSymbol: string;
  coinName: string;
}

// ═══════════════════════════════════════════════════════════════
// 💎 HIDDEN GEM DETECTOR
// عملة صغيرة بإمكانيات كبيرة
// ═══════════════════════════════════════════════════════════════
function detectHiddenGem(
  coin: MineableCoinData,
  scoreBreakdown: ScoreBreakdown
): DetectedOpportunity | null {
  const mcap = coin.marketCap ?? 0;
  const volume = coin.volume24h ?? 0;
  const liquidity = coin.liquidityScore ?? 0;

  // شروط Hidden Gem:
  // 1. Market cap بين $1M و $50M (صغيرة)
  // 2. Volume لا بأس به (>$100K)
  // 3. Liquidity معقولة (>30)
  // 4. Score >= 50

  const isSmallCap = mcap >= 1_000_000 && mcap <= 50_000_000;
  const hasVolume = volume >= 100_000;
  const hasLiquidity = liquidity >= 30;
  const hasGoodScore = scoreBreakdown.total >= 50;

  if (!isSmallCap || !hasVolume || !hasLiquidity || !hasGoodScore) {
    return null;
  }

  // حساب الـ confidence
  let confidence = 50;
  if (mcap < 20_000_000) confidence += 15; // أصغر = أفضل للـ gem
  if (volume > 1_000_000) confidence += 15;
  if (liquidity > 50) confidence += 10;
  if (scoreBreakdown.total > 70) confidence += 10;
  confidence = Math.min(100, confidence);

  return {
    kind: "hidden_gem",
    emoji: "💎",
    title: "جوهرة مخفية محتملة",
    signal: `${coin.name} عملة صغيرة (~$${formatMcap(mcap)}) بإمكانيات نمو`,
    reasoning: [
      `حجم سوقي صغير ($${formatMcap(mcap)}) - مساحة كبيرة للنمو`,
      `حجم تداول معقول ($${formatVolume(volume)}/يوم)`,
      `سيولة كافية للدخول والخروج (${liquidity}/100)`,
      `موجودة في ${coin.listingCount ?? 0} منصة`,
      ...scoreBreakdown.strengths.slice(0, 2),
    ],
    risks: [
      "العملات الصغيرة متقلبة جداً",
      "احتمالية الخسارة الكاملة موجودة",
      "السيولة قد تختفي فجأة",
      ...scoreBreakdown.weaknesses.slice(0, 2),
    ],
    riskLevel: mcap < 10_000_000 ? "high" : "medium",
    audience: "intermediate",
    timeframe: "medium",
    confidence,
    score: scoreBreakdown.total,
    coinSymbol: coin.symbol,
    coinName: coin.name,
  };
}

// ═══════════════════════════════════════════════════════════════
// 🚀 PUMP ALERT DETECTOR
// ارتفاع قوي مفاجئ
// ═══════════════════════════════════════════════════════════════
function detectPumpAlert(
  coin: MineableCoinData,
  scoreBreakdown: ScoreBreakdown
): DetectedOpportunity | null {
  const change = coin.priceChange24h ?? 0;
  const volume = coin.volume24h ?? 0;

  // شروط Pump:
  // 1. ارتفاع >= 10% في 24 ساعة
  // 2. حجم تداول معقول

  const hasPump = change >= 10;
  const hasVolume = volume >= 50_000;

  if (!hasPump || !hasVolume) {
    return null;
  }

  // تصنيف شدة الـ pump
  let intensity: "moderate" | "strong" | "extreme";
  if (change >= 50) intensity = "extreme";
  else if (change >= 25) intensity = "strong";
  else intensity = "moderate";

  // حساب confidence (pump أعلى = أقل موثوقية للاستمرار)
  let confidence = 70;
  if (change > 100) confidence = 30; // pump مبالغ فيه
  else if (change > 50) confidence = 40;
  else if (change > 25) confidence = 60;
  else confidence = 75;

  if (volume > 1_000_000) confidence += 10;

  return {
    kind: "pump_alert",
    emoji: intensity === "extreme" ? "🔥" : "🚀",
    title:
      intensity === "extreme"
        ? "ارتفاع متطرف - حذر!"
        : intensity === "strong"
          ? "ارتفاع قوي - فرصة محتملة"
          : "ارتفاع ملحوظ",
    signal: `${coin.name} ارتفعت بنسبة ${change.toFixed(1)}% في 24 ساعة`,
    reasoning: [
      `زيادة سعرية ${change.toFixed(1)}% خلال يوم واحد`,
      `حجم تداول نشط ($${formatVolume(volume)})`,
      "اهتمام متزايد من المتداولين",
      intensity === "extreme"
        ? "حركة قوية جداً - قد تكون مضاربة"
        : "زخم إيجابي قوي",
    ],
    risks: [
      intensity === "extreme"
        ? "احتمالية انعكاس قوي (dump) كبيرة جداً"
        : "احتمالية تصحيح هبوطي",
      "FOMO قد يدفع للشراء بسعر مرتفع",
      "يحتاج وقف خسارة صارم",
      ...(intensity === "extreme" ? ["قد يكون pump and dump"] : []),
    ],
    riskLevel: intensity === "extreme" ? "extreme" : "high",
    audience: "expert",
    timeframe: "short",
    confidence,
    score: scoreBreakdown.total,
    coinSymbol: coin.symbol,
    coinName: coin.name,
  };
}

// ═══════════════════════════════════════════════════════════════
// 💀 DEAD COIN DETECTOR
// عملة في طريقها للموت
// ═══════════════════════════════════════════════════════════════
function detectDeadCoin(
  coin: MineableCoinData,
  scoreBreakdown: ScoreBreakdown
): DetectedOpportunity | null {
  const volume = coin.volume24h ?? 0;
  const liquidity = coin.liquidityScore ?? 0;
  const listings = coin.listingCount ?? 0;
  const mcap = coin.marketCap ?? 0;

  // شروط Dead Coin:
  // 1. Volume < $50K
  // 2. Liquidity < 25
  // 3. Listings < 5
  // أو حالة "dead" في DB

  const isDead = coin.status === "dead";
  const veryLowVolume = volume < 50_000;
  const veryLowLiquidity = liquidity < 25;
  const fewListings = listings < 5;

  // إذا 2 من 3 شروط متحققة → dead coin
  const conditions = [veryLowVolume, veryLowLiquidity, fewListings].filter(Boolean).length;

  if (!isDead && conditions < 2) {
    return null;
  }

  // confidence أعلى عندما الشروط أكثر
  const confidence = isDead ? 95 : 50 + conditions * 15;

  return {
    kind: "dead_coin",
    emoji: "💀",
    title: "تحذير - عملة في خطر",
    signal: `${coin.name} تظهر علامات تراجع شديد`,
    reasoning: [
      veryLowVolume ? `حجم تداول منخفض جداً ($${formatVolume(volume)})` : "",
      veryLowLiquidity ? `سيولة شبه معدومة (${liquidity}/100)` : "",
      fewListings ? `موجودة في ${listings} منصات فقط` : "",
      mcap < 1_000_000 ? "حجم سوقي صغير جداً" : "",
      "اهتمام محدود من المجتمع",
    ].filter(Boolean),
    risks: [
      "صعوبة بيع العملة عند الحاجة",
      "احتمالية انهيار السعر بالكامل",
      "قد تُحذف من المنصات قريباً",
      "خسارة كاملة محتملة",
    ],
    riskLevel: "extreme",
    audience: "expert",
    timeframe: "short",
    confidence,
    score: scoreBreakdown.total,
    coinSymbol: coin.symbol,
    coinName: coin.name,
  };
}

// ═══════════════════════════════════════════════════════════════
// 🆕 NEW LISTING DETECTOR
// عملة جديدة بإمكانيات
// ═══════════════════════════════════════════════════════════════
function detectNewListing(
  coin: MineableCoinData,
  scoreBreakdown: ScoreBreakdown
): DetectedOpportunity | null {
  const mcap = coin.marketCap ?? 0;
  const volume = coin.volume24h ?? 0;
  const listings = coin.listingCount ?? 0;

  // شروط New Listing:
  // 1. Market cap < $20M (جديدة عادة صغيرة)
  // 2. Listings بين 3-10 (محدودة لكن موجودة)
  // 3. Volume موجود

  const isNewSize = mcap > 0 && mcap < 20_000_000;
  const limitedListings = listings >= 3 && listings <= 10;
  const hasActivity = volume > 10_000;

  if (!isNewSize || !limitedListings || !hasActivity) {
    return null;
  }

  let confidence = 60;
  if (scoreBreakdown.total > 60) confidence += 15;
  if (volume > 100_000) confidence += 10;
  confidence = Math.min(100, confidence);

  return {
    kind: "new_listing",
    emoji: "🆕",
    title: "عملة جديدة في الرادار",
    signal: `${coin.name} عملة حديثة بانتشار محدود (${listings} منصات)`,
    reasoning: [
      `موجودة في ${listings} منصات فقط - فرصة دخول مبكر`,
      `حجم سوقي صغير ($${formatMcap(mcap)})`,
      `نشاط تداول موجود ($${formatVolume(volume)})`,
      "إمكانية إدراج في منصات أكبر مستقبلاً",
    ],
    risks: [
      "قلة المعلومات التاريخية",
      "تقلب سعري حاد متوقع",
      "السيولة محدودة",
      "احتمالية فشل المشروع",
    ],
    riskLevel: "high",
    audience: "intermediate",
    timeframe: "medium",
    confidence,
    score: scoreBreakdown.total,
    coinSymbol: coin.symbol,
    coinName: coin.name,
  };
}

// ═══════════════════════════════════════════════════════════════
// 🚀 MAIN DETECTOR FUNCTION
// يفحص عملة ويرجع كل الفرص المكتشفة
// ═══════════════════════════════════════════════════════════════
export function detectOpportunities(
  coin: MineableCoinData
): DetectedOpportunity[] {
  const scoreBreakdown = calculateScore(coin);
  const opportunities: DetectedOpportunity[] = [];

  // فحص كل نوع
  const hiddenGem = detectHiddenGem(coin, scoreBreakdown);
  if (hiddenGem) opportunities.push(hiddenGem);

  const pumpAlert = detectPumpAlert(coin, scoreBreakdown);
  if (pumpAlert) opportunities.push(pumpAlert);

  const deadCoin = detectDeadCoin(coin, scoreBreakdown);
  if (deadCoin) opportunities.push(deadCoin);

  const newListing = detectNewListing(coin, scoreBreakdown);
  if (newListing) opportunities.push(newListing);

  return opportunities;
}

// ═══════════════════════════════════════════════════════════════
// 📊 BATCH DETECTION
// يفحص عدة عملات ويرجع كل الفرص مرتبة بالـ confidence
// ═══════════════════════════════════════════════════════════════
export function detectAllOpportunities(
  coins: MineableCoinData[]
): DetectedOpportunity[] {
  const allOpportunities: DetectedOpportunity[] = [];

  for (const coin of coins) {
    const opps = detectOpportunities(coin);
    allOpportunities.push(...opps);
  }

  // ترتيب حسب confidence (الأعلى أولاً)
  return allOpportunities.sort((a, b) => b.confidence - a.confidence);
}

// ═══════════════════════════════════════════════════════════════
// 🎨 HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════
function formatMcap(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return value.toFixed(0);
}

function formatVolume(value: number): string {
  return formatMcap(value);
}

// ═══════════════════════════════════════════════════════════════
// 🌐 LABELS (للـ UI)
// ═══════════════════════════════════════════════════════════════
export function opportunityKindLabel(kind: OpportunityKind): string {
  const labels: Record<OpportunityKind, string> = {
    hidden_gem: "جوهرة مخفية",
    pump_alert: "ارتفاع قوي",
    dead_coin: "عملة في خطر",
    new_listing: "عملة جديدة",
  };
  return labels[kind];
}

export function riskLevelLabel(level: RiskLevel): string {
  const labels: Record<RiskLevel, string> = {
    low: "مخاطر منخفضة",
    medium: "مخاطر متوسطة",
    high: "مخاطر عالية",
    extreme: "مخاطر شديدة",
  };
  return labels[level];
}

export function riskLevelColor(level: RiskLevel): string {
  const colors: Record<RiskLevel, string> = {
    low: "#10b981",
    medium: "#f59e0b",
    high: "#f97316",
    extreme: "#ef4444",
  };
  return colors[level];
}

export function audienceLabel(audience: Audience): string {
  const labels: Record<Audience, string> = {
    beginner: "للمبتدئين",
    intermediate: "للمتوسطين",
    expert: "للخبراء فقط",
  };
  return labels[audience];
}

export function timeframeLabel(timeframe: Timeframe): string {
  const labels: Record<Timeframe, string> = {
    short: "قصير المدى",
    medium: "متوسط المدى",
    long: "طويل المدى",
  };
  return labels[timeframe];
}