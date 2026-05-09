import type { CoinData } from "@/lib/engine/types";

export type Opportunity = {
  type: "difficulty_drop" | "volume_surge" | "momentum_breakout" | "oversold";
  symbol: string;
  severity: "info" | "warning" | "alert";
  title: string;
  description: string;
  confidence: number;
};

export function detectOpportunities(coins: CoinData[]): Opportunity[] {
  const opportunities: Opportunity[] = [];

  for (const coin of coins) {
    if (coin.difficultyChange24h < -2) {
      opportunities.push({
        type: "difficulty_drop",
        symbol: coin.symbol,
        severity: "alert",
        title: `🎯 فرصة: صعوبة ${coin.symbol} انخفضت`,
        description: `الصعوبة هبطت ${Math.abs(coin.difficultyChange24h).toFixed(1)}% في 24h. التعدين أصبح أسهل والربح المحتمل أعلى.`,
        confidence: Math.min(95, 60 + Math.abs(coin.difficultyChange24h) * 5),
      });
    }

    const avgVolume = coins.reduce((s, c) => s + c.volume24h, 0) / coins.length;
    if (coin.volume24h > avgVolume * 1.5 && coin.priceChange24h > 0) {
      opportunities.push({
        type: "volume_surge",
        symbol: coin.symbol,
        severity: "warning",
        title: `📊 ${coin.symbol}: ارتفاع غير عادي في الحجم`,
        description: `حجم التداول أعلى بـ ${Math.round(((coin.volume24h / avgVolume) - 1) * 100)}% من المتوسط مع ارتفاع السعر. اهتمام متزايد.`,
        confidence: 75,
      });
    }

    if (coin.priceChange24h > 3 && coin.priceChange7d > 5) {
      opportunities.push({
        type: "momentum_breakout",
        symbol: coin.symbol,
        severity: "warning",
        title: `🚀 ${coin.symbol}: زخم صاعد قوي`,
        description: `+${coin.priceChange24h.toFixed(1)}% في 24h و +${coin.priceChange7d.toFixed(1)}% في 7d. اتجاه صاعد مستمر.`,
        confidence: 70,
      });
    }

    if (coin.priceChange24h < -8 && coin.priceChange7d < -10) {
      opportunities.push({
        type: "oversold",
        symbol: coin.symbol,
        severity: "info",
        title: `💡 ${coin.symbol}: قد تكون مُباعة بإفراط`,
        description: `هبوط حاد ${coin.priceChange24h.toFixed(1)}% (24h) و ${coin.priceChange7d.toFixed(1)}% (7d). فرصة محتملة للتراكم بحذر.`,
        confidence: 55,
      });
    }
  }

  return opportunities.sort((a, b) => b.confidence - a.confidence);
}