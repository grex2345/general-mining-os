import type { CoinData } from "@/lib/engine/types";

export type Forecast = {
  symbol: string;
  currentDailyProfit: number;
  forecast7d: { min: number; expected: number; max: number };
  forecast30d: { min: number; expected: number; max: number };
  trend: "bullish" | "bearish" | "neutral";
  confidence: number;
};

export function forecastProfit(coin: CoinData): Forecast {
  const momentumFactor = 1 + (coin.priceChange7d / 100) * 0.3;
  const difficultyFactor = 1 - (coin.difficultyChange24h / 100) * 0.5;

  const baseDaily = coin.dailyProfitUSD;
  const adjustedDaily = baseDaily * momentumFactor * difficultyFactor;

  const volatilityRange = coin.volatility / 100;

  const forecast7d = {
    min: adjustedDaily * 7 * (1 - volatilityRange * 0.5),
    expected: adjustedDaily * 7,
    max: adjustedDaily * 7 * (1 + volatilityRange * 0.5),
  };

  const forecast30d = {
    min: adjustedDaily * 30 * (1 - volatilityRange * 0.7),
    expected: adjustedDaily * 30,
    max: adjustedDaily * 30 * (1 + volatilityRange * 0.7),
  };

  let trend: "bullish" | "bearish" | "neutral";
  const trendScore = coin.priceChange24h * 0.3 + coin.priceChange7d * 0.7;
  if (trendScore > 3) trend = "bullish";
  else if (trendScore < -3) trend = "bearish";
  else trend = "neutral";

  const confidence = Math.max(30, Math.min(85, 80 - coin.volatility * 0.5));

  return {
    symbol: coin.symbol,
    currentDailyProfit: baseDaily,
    forecast7d: {
      min: Number(forecast7d.min.toFixed(2)),
      expected: Number(forecast7d.expected.toFixed(2)),
      max: Number(forecast7d.max.toFixed(2)),
    },
    forecast30d: {
      min: Number(forecast30d.min.toFixed(2)),
      expected: Number(forecast30d.expected.toFixed(2)),
      max: Number(forecast30d.max.toFixed(2)),
    },
    trend,
    confidence: Math.round(confidence),
  };
}