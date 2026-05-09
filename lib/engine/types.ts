export type CoinData = {
  symbol: string;
  name: string;
  algorithm: string;
  dailyProfitUSD: number;
  pricePerCoin: number;
  volume24h: number;
  marketCap: number;
  difficultyChange24h: number;
  priceChange24h: number;
  priceChange7d: number;
  volatility: number;
};

export type CoinScore = {
  symbol: string;
  totalScore: number;
  breakdown: {
    profitability: number;
    momentum: number;
    volume: number;
    marketCap: number;
    difficulty: number;
    volatility: number;
  };
};

export type RiskLevel = "low" | "medium" | "high";

export type RiskAssessment = {
  level: RiskLevel;
  score: number;
  factors: string[];
};

export type SwitchProtection = {
  minScoreDifference: number;
  confirmationCycles: number;
  cooldownHours: number;
};

export type SwitchHistory = {
  lastSwitchTime: Date | null;
  currentCoin: string;
  pendingCoin: string | null;
  pendingConfirmations: number;
};

export type Decision = {
  action: "stay" | "switch" | "wait";
  currentCoin: string;
  recommendedCoin: string;
  confidence: number;
  reason: string;
  risk: RiskAssessment;
  scores: CoinScore[];
  alert?: {
    type: "info" | "warning" | "success";
    message: string;
  };
  timestamp: Date;
};