import type { CoinData, RiskAssessment } from "@/lib/engine/types";

export function assessRisk(coin: CoinData): RiskAssessment {
  const factors: string[] = [];
  let riskScore = 0;

  if (coin.volatility > 50) {
    riskScore += 30;
    factors.push(`تقلبات عالية (${coin.volatility}%)`);
  } else if (coin.volatility > 35) {
    riskScore += 15;
    factors.push(`تقلبات متوسطة (${coin.volatility}%)`);
  }

  if (coin.marketCap < 100_000_000) {
    riskScore += 25;
    factors.push("Market Cap صغير (أقل من 100M)");
  } else if (coin.marketCap < 500_000_000) {
    riskScore += 10;
    factors.push("Market Cap متوسط");
  }

  if (coin.volume24h < 5_000_000) {
    riskScore += 25;
    factors.push("سيولة منخفضة (Volume < 5M)");
  } else if (coin.volume24h < 20_000_000) {
    riskScore += 10;
    factors.push("سيولة متوسطة");
  }

  if (coin.difficultyChange24h > 5) {
    riskScore += 15;
    factors.push(`صعوبة الشبكة ترتفع (+${coin.difficultyChange24h}%)`);
  }

  if (coin.priceChange24h < -10) {
    riskScore += 15;
    factors.push(`السعر هبط بقوة (${coin.priceChange24h}%)`);
  }

  if (factors.length === 0) {
    factors.push("مؤشرات مستقرة");
  }

  let level: "low" | "medium" | "high";
  if (riskScore < 20) level = "low";
  else if (riskScore < 50) level = "medium";
  else level = "high";

  return {
    level,
    score: Math.min(100, riskScore),
    factors,
  };
}