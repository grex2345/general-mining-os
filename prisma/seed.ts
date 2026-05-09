// @ts-nocheck
import 'dotenv/config'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from '../lib/generated/prisma'

const adapter = new PrismaBetterSqlite3({
  url: 'file:./prisma/dev.db',
})

const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('🌱 جاري تعمير الداتابيز...')

  const settings = await prisma.userSettings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      currentMiningCoin: 'KAS',
      electricityCost: 0.12,
      safeMode: true,
      minSwitchProfit: 8.0,
    },
  })
  console.log('✅ الإعدادات:', settings)

  const welcomeAlert = await prisma.alertLog.create({
    data: {
      type: 'info',
      title: '👑 مرحبا بك يا الجنرال',
      message: 'تم تشغيل GENERAL MINING OS بنجاح!',
    },
  })
  console.log('✅ التنبيه:', welcomeAlert)

  const firstDecision = await prisma.decisionLog.create({
    data: {
      coin: 'KAS',
      action: 'stay',
      score: 78.5,
      risk: 'low',
      reason: 'KAS لا زال مربحاً، لا حاجة للتبديل',
    },
  })
  console.log('✅ القرار الأول:', firstDecision)

  console.log('🎉 تم تعمير الداتابيز بنجاح!')
}

main()
  .catch((e) => {
    console.error('❌ خطأ:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })