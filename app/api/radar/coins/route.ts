// ═══════════════════════════════════════════════════════════════
// 🌐 API: GET /api/radar/coins
// يرجع كل العملات مع scores وتحليل كامل
// مع دعم: filtering, sorting, search, pagination
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import {
  calculateBatchScores,
  filterByTier,
  filterByVram,
  filterByAlgorithm,
  searchCoins,
  sortCoins,
  type SortBy,
  type SortDirection,
  type ScoreTier,
} from "@/lib/radar/engine";
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
export async function GET(request: NextRequest) {
  try {
    // ─────────────────────────────────────────────────────────────
    // 1. قراءة Query Parameters
    // ─────────────────────────────────────────────────────────────
    const { searchParams } = new URL(request.url);

    const status = searchParams.get("status"); // active | watchlist | dead | null (all)
    const tiers = searchParams.get("tiers")?.split(","); // excellent,good,...
    const maxVram = searchParams.get("maxVram"); // 4, 6, 8...
    const algorithms = searchParams.get("algorithms")?.split(","); // KawPow,Ethash,...
    const search = searchParams.get("search"); // bitcoin, kas, ...
    const sortBy = (searchParams.get("sortBy") || "score") as SortBy;
    const sortDir = (searchParams.get("sortDir") || "desc") as SortDirection;
    const limit = parseInt(searchParams.get("limit") || "100");
    const offset = parseInt(searchParams.get("offset") || "0");

    // ─────────────────────────────────────────────────────────────
    // 2. جلب العملات من قاعدة البيانات
    // ─────────────────────────────────────────────────────────────
    const whereClause: { status?: string } = {};
    if (status) {
      whereClause.status = status;
    }

    const coinsFromDb = await prisma.mineableCoin.findMany({
      where: whereClause,
    });

    // ─────────────────────────────────────────────────────────────
    // 3. تحويل البيانات للنوع المطلوب
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
    // 4. حساب Scores لكل العملات
    // ─────────────────────────────────────────────────────────────
    let scoredCoins = calculateBatchScores(coins);

    // ─────────────────────────────────────────────────────────────
    // 5. تطبيق الفلاتر
    // ─────────────────────────────────────────────────────────────
    if (tiers && tiers.length > 0) {
      scoredCoins = filterByTier(scoredCoins, tiers as ScoreTier[]);
    }

    if (maxVram) {
      scoredCoins = filterByVram(scoredCoins, parseInt(maxVram));
    }

    if (algorithms && algorithms.length > 0) {
      scoredCoins = filterByAlgorithm(scoredCoins, algorithms);
    }

    if (search) {
      scoredCoins = searchCoins(scoredCoins, search);
    }

    // ─────────────────────────────────────────────────────────────
    // 6. الترتيب
    // ─────────────────────────────────────────────────────────────
    scoredCoins = sortCoins(scoredCoins, sortBy, sortDir);

    // ─────────────────────────────────────────────────────────────
    // 7. Pagination
    // ─────────────────────────────────────────────────────────────
    const total = scoredCoins.length;
    const paginatedCoins = scoredCoins.slice(offset, offset + limit);

    // ─────────────────────────────────────────────────────────────
    // 8. تحضير الـ Response
    // ─────────────────────────────────────────────────────────────
    const response = {
      success: true,
      data: {
        coins: paginatedCoins.map((s) => ({
          // Basic info
          symbol: s.coin.symbol,
          name: s.coin.name,
          algorithm: s.coin.algorithm,
          status: s.coin.status,

          // Mining info
          gpuMineable: s.coin.gpuMineable,
          minVramGB: s.coin.minVramGB,

          // Market data
          price: s.coin.price,
          marketCap: s.coin.marketCap,
          volume24h: s.coin.volume24h,
          priceChange24h: s.coin.priceChange24h,

          // Network data
          networkHashrate: s.coin.networkHashrate,
          difficulty: s.coin.difficulty,
          blockReward: s.coin.blockReward,
          blockTimeSeconds: s.coin.blockTimeSeconds,

          // Liquidity
          liquidityScore: s.coin.liquidityScore,
          listingCount: s.coin.listingCount,

          // Reliability
          dataSource: s.coin.dataSource,
          reliability: s.coin.reliability,

          // Scoring
          score: s.score.total,
          tier: s.score.tier,
          factors: s.score.factors,
          strengths: s.score.strengths,
          weaknesses: s.score.weaknesses,
        })),

        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total,
        },

        filters: {
          status: status || "all",
          tiers: tiers || [],
          maxVram: maxVram ? parseInt(maxVram) : null,
          algorithms: algorithms || [],
          search: search || "",
        },

        sort: {
          by: sortBy,
          direction: sortDir,
        },
      },
      meta: {
        timestamp: new Date().toISOString(),
        version: "1.0",
      },
    };

    // ─────────────────────────────────────────────────────────────
    // 9. إرجاع الـ Response
    // ─────────────────────────────────────────────────────────────
    return NextResponse.json(response, {
      status: 200,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("[API /radar/coins] Error:", error);

    return NextResponse.json(
      {
        success: false,
        error: {
          message: error instanceof Error ? error.message : "Unknown error",
          code: "INTERNAL_ERROR",
        },
        meta: {
          timestamp: new Date().toISOString(),
        },
      },
      { status: 500 }
    );
  }
}