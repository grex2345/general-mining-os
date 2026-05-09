-- CreateTable
CREATE TABLE "DecisionLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "coin" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "score" REAL NOT NULL,
    "risk" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "fromCoin" TEXT,
    "toCoin" TEXT
);

-- CreateTable
CREATE TABLE "ProfitLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "coin" TEXT NOT NULL,
    "hashrate" REAL NOT NULL,
    "power" REAL NOT NULL,
    "revenue" REAL NOT NULL,
    "cost" REAL NOT NULL,
    "profit" REAL NOT NULL
);

-- CreateTable
CREATE TABLE "AlertLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "coin" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "SwitchHistory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fromCoin" TEXT NOT NULL,
    "toCoin" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "profitDiff" REAL NOT NULL
);

-- CreateTable
CREATE TABLE "UserSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "currentMiningCoin" TEXT NOT NULL DEFAULT 'KAS',
    "electricityCost" REAL NOT NULL DEFAULT 0.12,
    "safeMode" BOOLEAN NOT NULL DEFAULT true,
    "minSwitchProfit" REAL NOT NULL DEFAULT 8.0,
    "updatedAt" DATETIME NOT NULL
);
