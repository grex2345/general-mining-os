// ═══════════════════════════════════════════════════════════════
// 🌐 API: GET /api/radar/opportunities
// يرجع الفرص الذهبية المكتشفة من كل العملات
// 4 أنواع: Hidden Gem, Pump Alert, Dead Coin, New Listing
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import {
  detectAllOpportunities,
  filterOpportunitiesByKind,
  filterOpportunitiesByRisk,
  filterOpportunitiesByAudience,
  type OpportunityKind,
  type RiskLevel,
  type Audience,
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

    const kinds = searchParams.get("kinds")?.split(",");
    const maxRisk = searchParams.get("maxRisk") as RiskLevel | null;
    const audience = searchParams.get("audience") as Audience | null;
    const minConfidence = parseInt(searchParams.get("minConfidence") || "0");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    // ─────────────────────────────────────────────────────────────
    // 2. جلب كل العملات النشطة
    // ─────────────────────────────────────────────────────────────
    const coinsFromDb = await prisma.mineableCoin.findMany({
      where: {
        OR: [{ status: "active" }, { status: "watchlist" }],
      },
    });

    // ─────────────────────────────────────────────────────────────
    // 3. تحويل البيانات
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
    // 4. كشف كل الفرص
    // ─────────────────────────────────────────────────────────────
    let opportunities = detectAllOpportunities(coins);

    // ─────────────────────────────────────────────────────────────
    // 5. تطبيق الفلاتر
    // ─────────────────────────────────────────────────────────────
    if (kinds && kinds.length > 0) {
      opportunities = filterOpportunitiesByKind(
        opportunities,
        kinds as OpportunityKind[]
      );
    }

    if (maxRisk) {
      opportunities = filterOpportunitiesByRisk(opportunities, maxRisk);
    }

    if (audience) {
      opportunities = filterOpportunitiesByAudience(opportunities, audience);
    }

    if (minConfidence > 0) {
      opportunities = opportunities.filter((o) => o.confidence >= minConfidence);
    }

    // ─────────────────────────────────────────────────────────────
    // 6. Pagination
    // ─────────────────────────────────────────────────────────────
    const total = opportunities.length;
    const paginatedOpportunities = opportunities.slice(offset, offset + limit);

    // ─────────────────────────────────────────────────────────────
    // 7. الإحصائيات
    // ─────────────────────────────────────────────────────────────
    const stats = {
      total: opportunities.length,
      byKind: {
        hidden_gem: opportunities.filter((o) => o.kind === "hidden_gem").length,
        pump_alert: opportunities.filter((o) => o.kind === "pump_alert").length,
        dead_coin: opportunities.filter((o) => o.kind === "dead_coin").length,
        new_listing: opportunities.filter((o) => o.kind === "new_listing").length,
      },
      byRisk: {
        low: opportunities.filter((o) => o.riskLevel === "low").length,
        medium: opportunities.filter((o) => o.riskLevel === "medium").length,
        high: opportunities.filter((o) => o.riskLevel === "high").length,
        extreme: opportunities.filter((o) => o.riskLevel === "extreme").length,
      },
      byAudience: {
        beginner: opportunities.filter((o) => o.audience === "beginner").length,
        intermediate: opportunities.filter((o) => o.audience === "intermediate").length,
        expert: opportunities.filter((o) => o.audience === "expert").length,
      },
      averageConfidence:
        opportunities.length > 0
          ? Math.round(
              opportunities.reduce((sum, o) => sum + o.confidence, 0) /
                opportunities.length
            )
          : 0,
    };

    // ─────────────────────────────────────────────────────────────
    // 8. Response
    // ─────────────────────────────────────────────────────────────
    return NextResponse.json(
      {
        success: true,
        data: {
          opportunities: paginatedOpportunities,
          stats,
          pagination: {
            total,
            limit,
            offset,
            hasMore: offset + limit < total,
          },
          filters: {
            kinds: kinds || [],
            maxRisk: maxRisk || null,
            audience: audience || null,
            minConfidence,
          },
        },
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
    console.error("[API /radar/opportunities] Error:", error);

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