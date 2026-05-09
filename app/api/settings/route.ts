import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/client'

// 📥 GET: جلب الإعدادات الحالية
export async function GET() {
  try {
    const settings = await prisma.userSettings.findUnique({
      where: { id: 1 },
    })

    if (!settings) {
      return NextResponse.json(
        { error: 'الإعدادات غير موجودة' },
        { status: 404 }
      )
    }

    return NextResponse.json(settings)
  } catch (error) {
    console.error('❌ خطأ في GET /api/settings:', error)
    return NextResponse.json(
      { error: 'فشل في جلب الإعدادات' },
      { status: 500 }
    )
  }
}

// 📤 PUT: تحديث الإعدادات
export async function PUT(request: Request) {
  try {
    const body = await request.json()

    const updated = await prisma.userSettings.update({
      where: { id: 1 },
      data: {
        currentMiningCoin: body.currentMiningCoin,
        electricityCost: body.electricityCost,
        safeMode: body.safeMode,
        minSwitchProfit: body.minSwitchProfit,
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('❌ خطأ في PUT /api/settings:', error)
    return NextResponse.json(
      { error: 'فشل في تحديث الإعدادات' },
      { status: 500 }
    )
  }
}