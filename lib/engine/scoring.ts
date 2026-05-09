import type { CoinData, CoinScore } from "@/lib/engine/types";

const WEIGHTS = {
  profitability: 35,
  momentum: 20,
  volume: 15,
  marketCap: 10,
  difficulty: 10,
  volatility: 10,
} as const;

function normalize(value: number, min: number, max: number): number {
  if (max === min) return 0;
  const clamped = Math.max(min, Math.min(max, value));
  return ((clamped - min) / (max - min)) * 100;
}

function scoreProfitability(coin: CoinData, allCoins: CoinData[]): number {
  const max = Math.max(...allCoins.map((c) => c.dailyProfitUSD));
  const min = Math.min(...allCoins.map((c) => c.dailyProfitUSD));
  return (normalize(coin.dailyProfitUSD, min, max) / 100) * WEIGHTS.profitability;
}

function scoreMomentum(coin: CoinData): number {
  const combined = coin.priceChange24h * 0.4 + coin.priceChange7d * 0.6;
  const normalized = normalize(combined, -20, 20);
  return (normalized / 100) * WEIGHTS.momentum;
}

function scoreVolume(coin: CoinData, allCoins: CoinData[]): number {
  const max = Math.max(...allCoins.map((c) => c.volume24h));
  const min = Math.min(...allCoins.map((c) => c.volume24h));
  return (normalize(coin.volume24h, min, max) / 100) * WEIGHTS.volume;
}

function scoreMarketCap(coin: CoinData): number {
  const normalized = normalize(Math.log10(coin.marketCap), 6, 11);
  return (normalized / 100) * WEIGHTS.marketCap;
}

function scoreDifficulty(coin: CoinData): number {
  const inverted = -coin.difficultyChange24h;
  const normalized = normalize(inverted, -10, 10);
  return (normalized / 100) * WEIGHTS.difficulty;
}

function scoreVolatility(coin: CoinData): number {
  const inverted = 100 - coin.volatility;
  return (inverted / 100) * WEIGHTS.volatility;
}

export function calculateCoinScore(
  coin: CoinData,
  allCoins: CoinData[]
): CoinScore {
  const breakdown = {
    profitability: scoreProfitability(coin, allCoins),
    momentum: scoreMomentum(coin),
    volume: scoreVolume(coin, allCoins),
    marketCap: scoreMarketCap(coin),
    difficulty: scoreDifficulty(coin),
    volatility: scoreVolatility(coin),
  };

  const totalScore = Object.values(breakdown).reduce((sum, v) => sum + v, 0);

  return {
    symbol: coin.symbol,
    totalScore: Math.round(totalScore * 10) / 10,
    breakdown: {
      profitability: Math.round(breakdown.profitability * 10) / 10,
      momentum: Math.round(breakdown.momentum * 10) / 10,
      volume: Math.round(breakdown.volume * 10) / 10,
      marketCap: Math.round(breakdown.marketCap * 10) / 10,
      difficulty: Math.round(breakdown.difficulty * 10) / 10,
      volatility: Math.round(breakdown.volatility * 10) / 10,
    },
  };
}

export function rankCoins(coins: CoinData[]): CoinScore[] {
  return coins
    .map((coin) => calculateCoinScore(coin, coins))
    .sort((a, b) => b.totalScore - a.totalScore);
}