// ═══════════════════════════════════════════════════════════════
// 🌐 API: GET /api/radar/stats
// إحصائيات شاملة عن كل العملات والفرص
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { analyzeRadar } from "@/lib/radar/engine";
import type { MineableCoinData, DataSource, Reliability } from "@/lib/radar/types";

// ═══════════════════════════════════════════════════════════════
// 🔌 Prisma Client setup
// ═══════════════════════════════════════════════════════════════
const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL || "file:./prisma/dev.db",
});

const prisma = new PrismaClient({ adapter });

// ═══════════════════════════════════════════════════════════════
// 🎯 GET Handler
// ═══════════════════════════════════════════════════════════════
export async function GET() {
  try {
    // ─────────────────────────────────────────────────────────────
    // 1. جلب كل العملات
    // ─────────────────────────────────────────────────────────────
    const coinsFromDb = await prisma.mineableCoin.findMany();

    // ─────────────────────────────────────────────────────────────
    // 2. تحويل البيانات
    // ─────────────────────────────────────────────────────────────
    const coins: MineableCoinData[] = coinsFromDb.map((c) => ({
      symbol: c.symbol,
      name: c.name,
      algorithm: c.algorithm,
      gpuMineable: c.gpuMineable,
      minVramGB: c.minVramGB ?? undefined,
      price: c.price ?? undefined,
      marketCap: c.marketCap ?? undefined,
      volume24h: c.volume24h ?? undefined,
      priceChange24h: c.priceChange24h ?? undefined,
      networkHashrate: c.networkHashrate ?? undefined,
      difficulty: c.difficulty ?? undefined,
      blockReward: c.blockReward ?? undefined,
      blockTimeSeconds: c.blockTimeSeconds ?? undefined,
      liquidityScore: c.liquidityScore ?? undefined,
      listingCount: c.listingCount ?? undefined,
      status: c.status as "active" | "watchlist" | "dead",
      dataSource: c.dataSource as DataSource,
      reliability: c.reliability as Reliability,
    }));

    // ─────────────────────────────────────────────────────────────
    // 3. تحليل شامل
    // ─────────────────────────────────────────────────────────────
    const analysis = analyzeRadar(coins);

    // ─────────────────────────────────────────────────────────────
    // 4. حسابات إضافية
    // ─────────────────────────────────────────────────────────────

    // إحصائيات حسب الحالة
    const byStatus = {
      active: coins.filter((c) => c.status === "active").length,
      watchlist: coins.filter((c) => c.status === "watchlist").length,
      dead: coins.filter((c) => c.status === "dead").length,
    };

    // إحصائيات حسب الموثوقية
    const byReliability = {
      high: coins.filter((c) => c.reliability === "high").length,
      medium: coins.filter((c) => c.reliability === "medium").length,
      low: coins.filter((c) => c.reliability === "low").length,
    };

    // إحصائيات حسب VRAM
    const byVram = {
      "2GB": coins.filter((c) => (c.minVramGB ?? 999) <= 2).length,
      "4GB": coins.filter((c) => {
        const v = c.minVramGB ?? 999;
        return v > 2 && v <= 4;
      }).length,
      "6GB": coins.filter((c) => {
        const v = c.minVramGB ?? 999;
        return v > 4 && v <= 6;
      }).length,
      "8GB+": coins.filter((c) => (c.minVramGB ?? 999) > 6).length,
    };

    // أكثر الـ algorithms استخداماً
    const algorithmCounts: Record<string, number> = {};
    coins.forEach((c) => {
      algorithmCounts[c.algorithm] = (algorithmCounts[c.algorithm] || 0) + 1;
    });
    const topAlgorithms = Object.entries(algorithmCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // إحصائيات السوق الإجمالية
    const totalMarketCap = coins.reduce((sum, c) => sum + (c.marketCap ?? 0), 0);
    const totalVolume24h = coins.reduce((sum, c) => sum + (c.volume24h ?? 0), 0);

    // أعلى وأدنى حركة سعرية
    const sortedByChange = [...coins].sort(
      (a, b) => (b.priceChange24h ?? 0) - (a.priceChange24h ?? 0)
    );
    const topGainers = sortedByChange.slice(0, 5).map((c) => ({
      symbol: c.symbol,
      name: c.name,
      priceChange24h: c.priceChange24h,
    }));
    const topLosers = sortedByChange
      .slice(-5)
      .reverse()
      .map((c) => ({
        symbol: c.symbol,
        name: c.name,
        priceChange24h: c.priceChange24h,
      }));

    // ─────────────────────────────────────────────────────────────
    // 5. تحضير الـ Response
    // ─────────────────────────────────────────────────────────────
    const stats = {
      // المجاميع
      totals: {
        totalCoins: coins.length,
        totalOpportunities: analysis.opportunities.length,
        totalMarketCap,
        totalVolume24h,
      },

      // التصنيفات
      classification: {
        byStatus,
        byTier: {
          excellent: analysis.stats.excellentCount,
          good: analysis.stats.goodCount,
          average: analysis.stats.averageCount,
          poor: analysis.stats.poorCount,
          avoid: analysis.stats.avoidCount,
        },
        byReliability,
        byVram,
      },

      // الفرص
      opportunities: {
        total: analysis.opportunities.length,
        hiddenGems: analysis.stats.hiddenGems,
        pumpAlerts: analysis.stats.pumpAlerts,
        deadCoins: analysis.stats.deadCoins,
        newListings: analysis.stats.newListings,
      },

      // Top performers
      topAlgorithms,
      topGainers,
      topLosers,

      // Top opportunities (5 أفضل فرص)
      topOpportunities: analysis.top5Opportunities.map((o) => ({
        kind: o.kind,
        emoji: o.emoji,
        title: o.title,
        signal: o.signal,
        coinSymbol: o.coinSymbol,
        coinName: o.coinName,
        confidence: o.confidence,
        riskLevel: o.riskLevel,
      })),

      // Top coins (5 أفضل عملات)
      topCoins: analysis.top5Coins.map((s) => ({
        symbol: s.coin.symbol,
        name: s.coin.name,
        algorithm: s.coin.algorithm,
        price: s.coin.price,
        marketCap: s.coin.marketCap,
        score: s.score.total,
        tier: s.score.tier,
      })),

      // Scoring stats
      scoring: {
        averageScore: analysis.stats.averageScore,
        topScore: analysis.stats.topScore,
      },
    };

    // ─────────────────────────────────────────────────────────────
    // 6. إرجاع الـ Response
    // ─────────────────────────────────────────────────────────────
    return NextResponse.json(
      {
        success: true,
        data: stats,
        meta: {
          timestamp: new Date().toISOString(),
          version: "1.0",
        },
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store, max-age=0" },
      }
    );
  } catch (error) {
    console.error("[API /radar/stats] Error:", error);

    return NextResponse.json(
      {
        success: false,
        error: {
          message: error instanceof Error ? error.message : "Unknown error",
          code: "INTERNAL_ERROR",
        },
        meta: { timestamp: new Date().toISOString() },
      },
      { status: 500 }
    );
  }
}