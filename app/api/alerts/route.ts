import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/client'

// 📥 GET: جلب التنبيهات
export async function GET() {
  try {
    const alerts = await prisma.alertLog.findMany({
      orderBy: { timestamp: 'desc' },
      take: 20,
    })
    return NextResponse.json(alerts)
  } catch (error) {
    return NextResponse.json({ error: 'فشل' }, { status: 500 })
  }
}

// 📤 POST: إضافة تنبيه جديد
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const alert = await prisma.alertLog.create({
      data: {
        type: body.type,
        title: body.title,
        message: body.message,
        coin: body.coin,
      },
    })
    return NextResponse.json(alert)
  } catch (error) {
    return NextResponse.json({ error: 'فشل' }, { status: 500 })
  }
}