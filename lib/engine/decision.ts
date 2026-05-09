import type { CoinData, Decision } from "@/lib/engine/types";
import { rankCoins } from "@/lib/engine/scoring";
import { assessRisk } from "@/lib/engine/risk";
import { SWITCH_PROTECTION } from "@/lib/constants/config";

export function makeDecision(
  coins: CoinData[],
  currentCoinSymbol: string
): Decision {
  const scores = rankCoins(coins);
  const topCoin = scores[0];
  const currentScore = scores.find((s) => s.symbol === currentCoinSymbol);

  const recommendedCoinData = coins.find((c) => c.symbol === topCoin.symbol)!;
  const risk = assessRisk(recommendedCoinData);

  if (!currentScore) {
    return {
      action: "switch",
      currentCoin: currentCoinSymbol,
      recommendedCoin: topCoin.symbol,
      confidence: Math.round(topCoin.totalScore),
      reason: `العملة الحالية غير موجودة في التحليل. ننصح بالتبديل لـ ${topCoin.symbol}.`,
      risk,
      scores,
      alert: { type: "warning", message: "تحقق من العملة الحالية" },
      timestamp: new Date(),
    };
  }

  if (topCoin.symbol === currentCoinSymbol) {
    return {
      action: "stay",
      currentCoin: currentCoinSymbol,
      recommendedCoin: currentCoinSymbol,
      confidence: Math.round(currentScore.totalScore),
      reason: `${currentCoinSymbol} لا تزال الأفضل (${currentScore.totalScore}/100). ابقَ عليها.`,
      risk,
      scores,
      alert: { type: "success", message: "أنت على العملة المثلى ✅" },
      timestamp: new Date(),
    };
  }

  const diff = topCoin.totalScore - currentScore.totalScore;
  const diffPercent = (diff / currentScore.totalScore) * 100;

  if (diffPercent < SWITCH_PROTECTION.minScoreDifference) {
    return {
      action: "wait",
      currentCoin: currentCoinSymbol,
      recommendedCoin: topCoin.symbol,
      confidence: Math.round(topCoin.totalScore),
      reason: `${topCoin.symbol} أفضل بـ ${diffPercent.toFixed(1)}% فقط. الفرق غير كافٍ للتبديل (الحد: ${SWITCH_PROTECTION.minScoreDifference}%).`,
      risk,
      scores,
      alert: { type: "info", message: "الفرق صغير — انتظر" },
      timestamp: new Date(),
    };
  }

  return {
    action: "switch",
    currentCoin: currentCoinSymbol,
    recommendedCoin: topCoin.symbol,
    confidence: Math.round(topCoin.totalScore),
    reason: `${topCoin.symbol} أفضل بـ ${diffPercent.toFixed(1)}% من ${currentCoinSymbol}. ننصح بالتبديل.`,
    risk,
    scores,
    alert: {
      type: "success",
      message: `فرصة: بدّل لـ ${topCoin.symbol} 🚀`,
    },
    timestamp: new Date(),
  };
}