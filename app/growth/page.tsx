import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Circle, Target } from "lucide-react";
import { USD_TO_MAD } from "@/lib/constants/config";

const CURRENT_MONTHLY_PROFIT_USD = 17;
const CURRENT_SAVINGS_MAD = 200;

const STAGES = [
  {
    id: 1, name: "المرحلة 1: GPU واحد (شمسي 8h)",
    status: "current" as const,
    cost: 6850,
    profitMonth: 17,
    description: "نقطة البداية. اختبار النظام بأقل مخاطرة.",
    items: ["1× RTX 3070", "Mobo + CPU + RAM", "PSU 1000W", "Riser + Frame"],
  },
  {
    id: 2, name: "المرحلة 2: + بطارية + إنفرتر (24h)",
    status: "next" as const,
    cost: 9700,
    profitMonth: 50,
    description: "تشغيل 24/7 بدون كهرباء. ربح x3.",
    items: ["Inverter 3KW Hybrid", "Lithium Battery 48V", "كابلات + حماية"],
  },
  {
    id: 3, name: "المرحلة 3: GPU ثاني",
    status: "future" as const,
    cost: 4200,
    profitMonth: 100,
    description: "مضاعفة الربح. خاص ألواح إضافية.",
    items: ["1× RTX 3070 آخر", "+1 لوح شمسي", "Riser إضافي"],
  },
  {
    id: 4, name: "المرحلة 4: Rig كامل (3-4 GPUs)",
    status: "future" as const,
    cost: 12000,
    profitMonth: 200,
    description: "Rig احترافي مع تبريد متقدم.",
    items: ["GPUs إضافية", "Frame معدني كبير", "Extractor Fan", "Smart Plugs"],
  },
  {
    id: 5, name: "المرحلة 5: مزرعة صغيرة",
    status: "future" as const,
    cost: 50000,
    profitMonth: 800,
    description: "8-10 GPUs، نظام شمسي كامل، أتمتة.",
    items: ["10+ GPUs", "نظام شمسي 5KW", "بطاريات ضخمة", "غرفة تبريد"],
  },
];

export default function GrowthPage() {
  const nextStage = STAGES.find((s) => s.status === "next")!;
  const monthsToNext = Math.ceil(
    (nextStage.cost - 6850) / (CURRENT_MONTHLY_PROFIT_USD * USD_TO_MAD)
  );
  const savingsProgress = (CURRENT_SAVINGS_MAD / (nextStage.cost - 6850)) * 100;

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">خطة النمو 🚀</h1>
        <p className="text-sm text-slate-400 mt-1">
          خارطة الطريق من GPU واحد لمزرعة كاملة
        </p>
      </div>

      <Card className="bg-green-500/5 border-green-500/30 mb-6">
        <CardContent className="p-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="p-2 rounded-lg bg-green-500/10">
              <Target className="w-5 h-5 text-green-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-white mb-1">
                🎯 الهدف القادم: {nextStage.name}
              </h3>
              <p className="text-sm text-slate-400">{nextStage.description}</p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-slate-400">التقدم في الادخار</span>
                <span className="text-green-400 font-bold">
                  {CURRENT_SAVINGS_MAD.toLocaleString()} / {(nextStage.cost - 6850).toLocaleString()} MAD
                </span>
              </div>
              <Progress value={Math.min(100, savingsProgress)} className="h-2" />
            </div>

            <div className="grid grid-cols-2 gap-3 mt-3">
              <div className="p-3 rounded-lg bg-slate-800/50">
                <p className="text-xs text-slate-500 mb-1">مطلوب جمعه</p>
                <p className="text-base font-bold text-white">
                  {(nextStage.cost - 6850 - CURRENT_SAVINGS_MAD).toLocaleString()} MAD
                </p>
              </div>
              <div className="p-3 rounded-lg bg-slate-800/50">
                <p className="text-xs text-slate-500 mb-1">الوقت المتوقع</p>
                <p className="text-base font-bold text-yellow-400">{monthsToNext} شهر</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <h2 className="text-xl font-bold text-white mb-4">🗺️ خارطة الطريق</h2>
      <div className="space-y-4">
        {STAGES.map((stage) => {
          const isCurrent = stage.status === "current";
          const isNext = stage.status === "next";
          const Icon = isCurrent ? CheckCircle2 : Circle;
          const borderColor = isCurrent
            ? "border-green-500/40"
            : isNext
            ? "border-yellow-500/40"
            : "border-slate-800";
          const iconColor = isCurrent
            ? "text-green-400"
            : isNext
            ? "text-yellow-400"
            : "text-slate-600";

          return (
            <Card key={stage.id} className={`bg-slate-900/60 ${borderColor}`}>
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  <Icon className={`w-6 h-6 ${iconColor} mt-1 flex-shrink-0`} />
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                      <h3 className="text-base font-bold text-white">{stage.name}</h3>
                      {isCurrent && <Badge variant="default">حالياً ✅</Badge>}
                      {isNext && <Badge variant="secondary">القادمة 🎯</Badge>}
                    </div>
                    <p className="text-sm text-slate-400 mb-3">{stage.description}</p>

                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div className="p-2 rounded bg-slate-800/50">
                        <p className="text-xs text-slate-500">التكلفة</p>
                        <p className="text-sm font-bold text-white">{stage.cost.toLocaleString()} MAD</p>
                      </div>
                      <div className="p-2 rounded bg-slate-800/50">
                        <p className="text-xs text-slate-500">الربح المتوقع</p>
                        <p className="text-sm font-bold text-green-400">${stage.profitMonth}/شهر</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {stage.items.map((item, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          {item}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}