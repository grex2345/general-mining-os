import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/client'

// 📥 GET: جلب سجلات الأرباح
export async function GET() {
  try {
    const profits = await prisma.profitLog.findMany({
      orderBy: { timestamp: 'desc' },
      take: 100,
    })
    return NextResponse.json(profits)
  } catch (error) {
    return NextResponse.json({ error: 'فشل' }, { status: 500 })
  }
}

// 📤 POST: تسجيل ربح جديد
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const profit = await prisma.profitLog.create({
      data: {
        coin: body.coin,
        hashrate: body.hashrate,
        power: body.power,
        revenue: body.revenue,
        cost: body.cost,
        profit: body.profit,
      },
    })
    return NextResponse.json(profit)
  } catch (error) {
    return NextResponse.json({ error: 'فشل' }, { status: 500 })
  }
}