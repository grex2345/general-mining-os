import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/client'

// 📥 GET: جلب كل القرارات
export async function GET() {
  try {
    const decisions = await prisma.decisionLog.findMany({
      orderBy: { timestamp: 'desc' },
      take: 50,
    })
    return NextResponse.json(decisions)
  } catch (error) {
    return NextResponse.json({ error: 'فشل' }, { status: 500 })
  }
}

// 📤 POST: حفظ قرار جديد
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const decision = await prisma.decisionLog.create({
      data: {
        coin: body.coin,
        action: body.action,
        score: body.score,
        risk: body.risk,
        reason: body.reason,
        fromCoin: body.fromCoin,
        toCoin: body.toCoin,
      },
    })
    return NextResponse.json(decision)
  } catch (error) {
    return NextResponse.json({ error: 'فشل' }, { status: 500 })
  }
}