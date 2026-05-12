// ═══════════════════════════════════════════════════════════════
// 🌱  PRISMA SEED SCRIPT
// يقوم بحقن البيانات الأولية (INITIAL_COINS) في قاعدة البيانات
// التشغيل: npx prisma db seed
// ═══════════════════════════════════════════════════════════════

import "dotenv/config";
import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { INITIAL_COINS } from "../lib/radar/registry/seed-data";

// ═══════════════════════════════════════════════════════════════
// 🔌 إعداد Prisma Client مع adapter
// ═══════════════════════════════════════════════════════════════
const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL || "file:./prisma/dev.db",
});

const prisma = new PrismaClient({ adapter });

// ═══════════════════════════════════════════════════════════════
// 🎨 Helpers للطباعة الملونة في الـ console
// ═══════════════════════════════════════════════════════════════
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
};

const log = {
  info: (msg: string) => console.log(`${colors.cyan}i${colors.reset}  ${msg}`),
  success: (msg: string) => console.log(`${colors.green}+${colors.reset}  ${msg}`),
  warn: (msg: string) => console.log(`${colors.yellow}!${colors.reset}  ${msg}`),
  error: (msg: string) => console.log(`${colors.red}x${colors.reset}  ${msg}`),
  title: (msg: string) =>
    console.log(`\n${colors.bright}${colors.magenta}${msg}${colors.reset}\n`),
  divider: () =>
    console.log(`${colors.gray}${"-".repeat(60)}${colors.reset}`),
};

// ═══════════════════════════════════════════════════════════════
// 🚀 Main Seed Function
// ═══════════════════════════════════════════════════════════════
async function main() {
  log.title(">> NEW COIN RADAR - SEED DATABASE");
  log.divider();

  log.info(`Number of coins in seed-data: ${INITIAL_COINS.length}`);
  log.divider();

  let created = 0;
  let updated = 0;
  let failed = 0;

  for (const coin of INITIAL_COINS) {
    try {
      const result = await prisma.mineableCoin.upsert({
        where: { symbol: coin.symbol },
        update: {
          name: coin.name,
          algorithm: coin.algorithm,
          gpuMineable: coin.gpuMineable,
          minVramGB: coin.minVramGB,
          price: coin.price,
          marketCap: coin.marketCap,
          volume24h: coin.volume24h,
          priceChange24h: coin.priceChange24h,
          networkHashrate: coin.networkHashrate,
          difficulty: coin.difficulty,
          blockReward: coin.blockReward,
          blockTimeSeconds: coin.blockTimeSeconds,
          liquidityScore: coin.liquidityScore,
          listingCount: coin.listingCount,
          status: coin.status,
          dataSource: coin.dataSource,
          reliability: coin.reliability,
          lastUpdated: new Date(),
        },
        create: {
          symbol: coin.symbol,
          name: coin.name,
          algorithm: coin.algorithm,
          gpuMineable: coin.gpuMineable,
          minVramGB: coin.minVramGB,
          price: coin.price,
          marketCap: coin.marketCap,
          volume24h: coin.volume24h,
          priceChange24h: coin.priceChange24h,
          networkHashrate: coin.networkHashrate,
          difficulty: coin.difficulty,
          blockReward: coin.blockReward,
          blockTimeSeconds: coin.blockTimeSeconds,
          liquidityScore: coin.liquidityScore,
          listingCount: coin.listingCount,
          status: coin.status,
          dataSource: coin.dataSource,
          reliability: coin.reliability,
        },
      });

      const isNew =
        result.firstSeenAt.getTime() === result.lastUpdated.getTime();

      if (isNew) {
        created++;
        log.success(
          `${colors.bright}${coin.symbol.padEnd(10)}${colors.reset} ${colors.gray}created${colors.reset} -> ${coin.name} (${coin.algorithm})`
        );
      } else {
        updated++;
        log.info(
          `${colors.bright}${coin.symbol.padEnd(10)}${colors.reset} ${colors.yellow}updated${colors.reset} -> ${coin.name} (${coin.algorithm})`
        );
      }
    } catch (error) {
      failed++;
      log.error(
        `Failed to insert ${coin.symbol}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 📊 الملخص النهائي
  // ═══════════════════════════════════════════════════════════════
  log.divider();
  log.title("[SEED SUMMARY]");
  console.log(`${colors.green}  + Created:${colors.reset}  ${created} coins`);
  console.log(`${colors.yellow}  ~ Updated:${colors.reset}  ${updated} coins`);
  console.log(`${colors.red}  x Failed:${colors.reset}   ${failed} coins`);
  log.divider();

  // ── إحصائيات إضافية من الـ DB ──────────────────────────
  const totalCoins = await prisma.mineableCoin.count();
  const activeCoins = await prisma.mineableCoin.count({
    where: { status: "active" },
  });
  const watchlistCoins = await prisma.mineableCoin.count({
    where: { status: "watchlist" },
  });
  const deadCoins = await prisma.mineableCoin.count({
    where: { status: "dead" },
  });

  log.title("[DATABASE STATE]");
  console.log(`  Total coins:     ${colors.bright}${totalCoins}${colors.reset}`);
  console.log(`  ${colors.green}* Active:${colors.reset}        ${activeCoins}`);
  console.log(`  ${colors.yellow}* Watchlist:${colors.reset}     ${watchlistCoins}`);
  console.log(`  ${colors.red}* Dead:${colors.reset}          ${deadCoins}`);
  log.divider();

  // ── إحصائيات الـ algorithms ────────────────────────────
  const algorithms = await prisma.mineableCoin.groupBy({
    by: ["algorithm"],
    _count: { algorithm: true },
    orderBy: { _count: { algorithm: "desc" } },
  });

  log.title("[ALGORITHMS DISTRIBUTION]");
  algorithms.forEach((algo) => {
    console.log(
      `  ${colors.cyan}${algo.algorithm.padEnd(15)}${colors.reset} -> ${algo._count.algorithm} coins`
    );
  });
  log.divider();

  // ── إحصائيات الـ reliability ───────────────────────────
  const highRel = await prisma.mineableCoin.count({
    where: { reliability: "high" },
  });
  const medRel = await prisma.mineableCoin.count({
    where: { reliability: "medium" },
  });
  const lowRel = await prisma.mineableCoin.count({
    where: { reliability: "low" },
  });

  log.title("[RELIABILITY BREAKDOWN]");
  console.log(`  ${colors.green}* High:${colors.reset}     ${highRel}`);
  console.log(`  ${colors.yellow}* Medium:${colors.reset}   ${medRel}`);
  console.log(`  ${colors.red}* Low:${colors.reset}      ${lowRel}`);
  log.divider();

  if (failed === 0) {
    log.title(">>> SEED COMPLETED SUCCESSFULLY! <<<");
  } else {
    log.title(`!!! SEED COMPLETED WITH ${failed} ERRORS !!!`);
  }
}

// ═══════════════════════════════════════════════════════════════
// 🏁 Execute
// ═══════════════════════════════════════════════════════════════
main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (e) => {
    log.error("Seed script failed:");
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });