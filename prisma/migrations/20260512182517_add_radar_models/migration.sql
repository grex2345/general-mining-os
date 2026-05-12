/*
  Warnings:

  - You are about to drop the `SwitchHistory` table. If the table is not empty, all the data it contains will be lost.
  - The primary key for the `AlertLog` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `DecisionLog` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `ProfitLog` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `cost` on the `ProfitLog` table. All the data in the column will be lost.
  - You are about to drop the column `profit` on the `ProfitLog` table. All the data in the column will be lost.
  - You are about to drop the column `revenue` on the `ProfitLog` table. All the data in the column will be lost.
  - You are about to drop the column `timestamp` on the `ProfitLog` table. All the data in the column will be lost.
  - You are about to drop the column `electricityCost` on the `UserSettings` table. All the data in the column will be lost.
  - You are about to drop the column `minSwitchProfit` on the `UserSettings` table. All the data in the column will be lost.
  - Added the required column `amountUSD` to the `ProfitLog` table without a default value. This is not possible if the table is not empty.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "SwitchHistory";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "MineableCoin" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL,
    "gpuMineable" BOOLEAN NOT NULL DEFAULT true,
    "minVramGB" INTEGER,
    "price" REAL,
    "marketCap" REAL,
    "volume24h" REAL,
    "priceChange24h" REAL,
    "networkHashrate" REAL,
    "difficulty" REAL,
    "blockReward" REAL,
    "blockTimeSeconds" INTEGER,
    "liquidityScore" REAL,
    "listingCount" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'active',
    "dataSource" TEXT NOT NULL,
    "reliability" TEXT NOT NULL,
    "lastUpdated" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "CoinSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "coinSymbol" TEXT NOT NULL,
    "price" REAL,
    "marketCap" REAL,
    "volume24h" REAL,
    "difficulty" REAL,
    "networkHashrate" REAL,
    "source" TEXT NOT NULL,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CoinSnapshot_coinSymbol_fkey" FOREIGN KEY ("coinSymbol") REFERENCES "MineableCoin" ("symbol") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "coinSymbol" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "score" REAL NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "signal" TEXT NOT NULL,
    "reasoning" TEXT NOT NULL,
    "risks" TEXT NOT NULL,
    "dataSource" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "detectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'active',
    CONSTRAINT "Opportunity_coinSymbol_fkey" FOREIGN KEY ("coinSymbol") REFERENCES "MineableCoin" ("symbol") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AlertLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "coin" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "new_AlertLog" ("coin", "id", "message", "read", "timestamp", "title", "type") SELECT "coin", "id", "message", "read", "timestamp", "title", "type" FROM "AlertLog";
DROP TABLE "AlertLog";
ALTER TABLE "new_AlertLog" RENAME TO "AlertLog";
CREATE INDEX "AlertLog_timestamp_idx" ON "AlertLog"("timestamp");
CREATE INDEX "AlertLog_read_idx" ON "AlertLog"("read");
CREATE TABLE "new_DecisionLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "coin" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "score" REAL NOT NULL,
    "risk" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "fromCoin" TEXT,
    "toCoin" TEXT
);
INSERT INTO "new_DecisionLog" ("action", "coin", "fromCoin", "id", "reason", "risk", "score", "timestamp", "toCoin") SELECT "action", "coin", "fromCoin", "id", "reason", "risk", "score", "timestamp", "toCoin" FROM "DecisionLog";
DROP TABLE "DecisionLog";
ALTER TABLE "new_DecisionLog" RENAME TO "DecisionLog";
CREATE INDEX "DecisionLog_timestamp_idx" ON "DecisionLog"("timestamp");
CREATE INDEX "DecisionLog_action_idx" ON "DecisionLog"("action");
CREATE TABLE "new_ProfitLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "coin" TEXT NOT NULL,
    "amountUSD" REAL NOT NULL,
    "hashrate" REAL,
    "power" REAL
);
INSERT INTO "new_ProfitLog" ("coin", "hashrate", "id", "power") SELECT "coin", "hashrate", "id", "power" FROM "ProfitLog";
DROP TABLE "ProfitLog";
ALTER TABLE "new_ProfitLog" RENAME TO "ProfitLog";
CREATE INDEX "ProfitLog_date_idx" ON "ProfitLog"("date");
CREATE TABLE "new_UserSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "currentMiningCoin" TEXT NOT NULL DEFAULT 'KAS',
    "electricityPrice" REAL NOT NULL DEFAULT 0.12,
    "switchThreshold" REAL NOT NULL DEFAULT 8.0,
    "safeMode" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_UserSettings" ("currentMiningCoin", "id", "safeMode", "updatedAt") SELECT "currentMiningCoin", "id", "safeMode", "updatedAt" FROM "UserSettings";
DROP TABLE "UserSettings";
ALTER TABLE "new_UserSettings" RENAME TO "UserSettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "MineableCoin_symbol_key" ON "MineableCoin"("symbol");

-- CreateIndex
CREATE INDEX "MineableCoin_status_idx" ON "MineableCoin"("status");

-- CreateIndex
CREATE INDEX "MineableCoin_gpuMineable_idx" ON "MineableCoin"("gpuMineable");

-- CreateIndex
CREATE INDEX "CoinSnapshot_coinSymbol_capturedAt_idx" ON "CoinSnapshot"("coinSymbol", "capturedAt");

-- CreateIndex
CREATE INDEX "Opportunity_status_score_idx" ON "Opportunity"("status", "score");

-- CreateIndex
CREATE INDEX "Opportunity_type_idx" ON "Opportunity"("type");
