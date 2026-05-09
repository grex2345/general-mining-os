import { NextResponse } from "next/server";
import { fetchCoinsFromCoinGecko } from "@/lib/integrations/coingecko";
import { MOCK_COINS } from "@/lib/constants/coins";

export const revalidate = 300;

export async function GET() {
  try {
    const coins = await fetchCoinsFromCoinGecko();
    return NextResponse.json({
      success: true,
      source: "coingecko",
      coins,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({
      success: true,
      source: "mock",
      coins: MOCK_COINS,
      timestamp: new Date().toISOString(),
      warning: error instanceof Error ? error.message : "Fallback to mock",
    });
  }
}