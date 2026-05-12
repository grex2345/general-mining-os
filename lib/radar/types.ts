// ═══════════════════════════════════════════
// 🎯 RADAR TYPES
// أنواع البيانات الأساسية لمحرك الـ Radar
// ═══════════════════════════════════════════

// ─── Truth Layer ──────────────────────────
export type DataSource = "live" | "mock" | "manual" | "estimated" | "stale";
export type Reliability = "high" | "medium" | "low";

/**
 * كل قيمة في النظام يجب أن تأتي بهذا الشكل
 * عشان نعرف من أين جاءت ومتى
 */
export type TruthValue<T> = {
  value: T;
  source: DataSource;
  fetchedAt: Date;
  reliability: Reliability;
  note?: string;
};

// ─── Mineable Coin ────────────────────────
export type CoinStatus = "active" | "watchlist" | "dead";

export type MineableCoinData = {
  symbol: string;
  name: string;
  algorithm: string;

  gpuMineable: boolean;
  minVramGB: number | null;

  price: number | null;
  marketCap: number | null;
  volume24h: number | null;
  priceChange24h: number | null;

  networkHashrate: number | null;
  difficulty: number | null;
  blockReward: number | null;
  blockTimeSeconds: number | null;

  liquidityScore: number | null;
  listingCount: number | null;
  status: CoinStatus;

  dataSource: DataSource;
  reliability: Reliability;
};

// ─── Opportunity ──────────────────────────
export type OpportunityType =
  | "new_coin"          // عملة جديدة تم اكتشافها
  | "difficulty_drop"   // انهيار في الصعوبة
  | "profit_spike"      // قفزة في الربحية
  | "small_cap_liquid"; // عملة صغيرة لكن سيولة جيدة

export type RiskLevel = "low" | "medium" | "high";
export type Audience = "beginner" | "intermediate" | "advanced";
export type Timeframe = "short_term" | "medium_term";

export type OpportunityData = {
  coinSymbol: string;
  type: OpportunityType;

  score: number;          // 0-100
  riskLevel: RiskLevel;
  audience: Audience;
  timeframe: Timeframe;

  signal: string;         // الإشارة المختصرة
  reasoning: string;      // الشرح المفصل
  risks: string;          // المخاطر

  dataSource: DataSource;
  confidence: number;     // 0-1

  expiresAt?: Date;
};

// ─── Algorithms (للمرجع) ──────────────────
export const SUPPORTED_ALGORITHMS = [
  "Autolykos2",       // ERGO
  "kHeavyHash",       // KAS
  "Etchash",          // ETC
  "KawPow",           // RVN
  "Equihash",         // FLUX, ZEC
  "BLAKE3",           // ALPH
  "Octopus",          // CFX
  "ProgPow",          // (legacy)
  "Ethash",           // (legacy)
  "Cuckatoo32",       // GRIN
  "Cuckoo29",         // AE
  "ZelHash",          // FLUX (variant)
] as const;

export type Algorithm = (typeof SUPPORTED_ALGORITHMS)[number];