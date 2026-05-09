import type { CoinData } from "@/lib/engine/types";

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";

const COIN_MAP: Record<string, { id: string; algorithm: string; estimatedDailyProfit: number }> = {
  ERGO: { id: "ergo", algorithm: "Autolykos2", estimatedDailyProfit: 0.62 },
  KAS: { id: "kaspa", algorithm: "kHeavyHash", estimatedDailyProfit: 0.55 },
  RVN: { id: "ravencoin", algorithm: "KawPow", estimatedDailyProfit: 0.48 },
  ETC: { id: "ethereum-classic", algorithm: "Etchash", estimatedDailyProfit: 0.51 },
  ALPH: { id: "alephium", algorithm: "Blake3", estimatedDailyProfit: 0.58 },
};

type CoinGeckoMarketResponse = {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  market_cap: number;
  total_volume: number;
  price_change_percentage_24h: number;
  price_change_percentage_7d_in_currency: number;
};

export async function fetchCoinsFromCoinGecko(): Promise<CoinData[]> {
  const ids = Object.values(COIN_MAP).map((c) => c.id).join(",");
  const url = `${COINGECKO_BASE}/coins/markets?vs_currency=usd&ids=${ids}&price_change_percentage=24h,7d`;

  const res = await fetch(url, {
    next: { revalidate: 300 },
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error(`CoinGecko API error: ${res.status}`);
  }

  const data: CoinGeckoMarketResponse[] = await res.json();

  const coins: CoinData[] = [];

  for (const [symbol, mapping] of Object.entries(COIN_MAP)) {
    const market = data.find((d) => d.id === mapping.id);
    if (!market) continue;

    const volatility = Math.min(
      100,
      Math.abs(market.price_change_percentage_24h ?? 0) * 2 +
        Math.abs(market.price_change_percentage_7d_in_currency ?? 0)
    );

    coins.push({
      symbol,
      name: market.name,
      algorithm: mapping.algorithm,
      dailyProfitUSD: mapping.estimatedDailyProfit,
      pricePerCoin: market.current_price,
      volume24h: market.total_volume,
      marketCap: market.market_cap,
      difficultyChange24h: estimateDifficultyChange(market.price_change_percentage_24h),
      priceChange24h: Number((market.price_change_percentage_24h ?? 0).toFixed(2)),
      priceChange7d: Number((market.price_change_percentage_7d_in_currency ?? 0).toFixed(2)),
      volatility: Math.round(volatility),
    });
  }

  return coins;
}

function estimateDifficultyChange(priceChange24h: number | null): number {
  if (priceChange24h === null) return 0;
  return Number((priceChange24h * 0.4).toFixed(2));
}