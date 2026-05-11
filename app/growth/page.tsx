"use client";

import { useState, useMemo } from "react";
import {
  Rocket,
  Target,
  TrendingUp,
  Calendar,
  DollarSign,
  Zap,
  Cpu,
  Sun,
  CheckCircle2,
  Clock,
  ArrowUp,
  Sparkles,
} from "lucide-react";
import { useSettings } from "@/components/providers/settings-provider";

type Milestone = {
  id: string;
  title: string;
  description: string;
  cost: number;
  benefit: string;
  icon: any;
  color: string;
  category: "gpu" | "solar" | "storage" | "cooling";
};

const MILESTONES: Milestone[] = [
  {
    id: "rtx-3060ti",
    title: "إضافة RTX 3060 Ti مستعمل",
    description: "كرت ثاني لمضاعفة الهاش ريت",
    cost: 170,
    benefit: "+$0.40/يوم",
    icon: Cpu,
    color: "blue",
    category: "gpu",
  },
  {
    id: "solar-panel",
    title: "إضافة لوح شمسي 280W",
    description: "تقليل تكلفة الكهرباء",
    cost: 50,
    benefit: "توفير $5/شهر",
    icon: Sun,
    color: "yellow",
    category: "solar",
  },
  {
    id: "rtx-3070",
    title: "إضافة RTX 3070",
    description: "أداء أعلى لتعدين Ergo & KAS",
    cost: 280,
    benefit: "+$0.55/يوم",
    icon: Cpu,
    color: "purple",
    category: "gpu",
  },
  {
    id: "battery",
    title: "بطارية 200Ah Gel",
    description: "تخزين الطاقة للتعدين الليلي",
    cost: 280,
    benefit: "+8 ساعات تعدين",
    icon: Zap,
    color: "green",
    category: "storage",
  },
  {
    id: "rtx-3080",
    title: "إضافة RTX 3080",
    description: "وحش التعدين - أعلى ربح",
    cost: 450,
    benefit: "+$0.80/يوم",
    icon: Cpu,
    color: "pink",
    category: "gpu",
  },
  {
    id: "inverter",
    title: "Inverter 3KW",
    description: "تشغيل أكبر للأجهزة من الطاقة الشمسية",
    cost: 320,
    benefit: "+3 GPU إضافية",
    icon: Zap,
    color: "orange",
    category: "storage",
  },
];

export default function GrowthPage() {
  const { settings } = useSettings();
  const [dailyProfit, setDailyProfit] = useState(0.65); // افتراضي

  const budget = settings.budget;
  const monthlyGoal = settings.monthlyGoal || 50;

  // الحسابات الذكية
  const calc = useMemo(() => {
    const monthlyProfit = dailyProfit * 30;
    const yearlyProfit = dailyProfit * 365;

    // كم يوم لتحقيق الهدف الشهري
    const daysToMonthlyGoal = monthlyGoal > 0 ? Math.ceil(monthlyGoal / dailyProfit) : 0;

    // الترتيب حسب الميزانية + التوفير
    const affordable = MILESTONES.filter((m) => m.cost <= budget);
    const next = MILESTONES.filter((m) => m.cost > budget).sort(
      (a, b) => a.cost - b.cost
    )[0];

    // وقت الوصول للـ next milestone
    const daysToNext = next
      ? Math.ceil((next.cost - budget) / dailyProfit)
      : 0;

    return {
      monthlyProfit,
      yearlyProfit,
      daysToMonthlyGoal,
      affordable,
      next,
      daysToNext,
    };
  }, [budget, dailyProfit, monthlyGoal]);

  // Progress للهدف القادم
  const nextProgress = calc.next
    ? Math.min(100, (budget / calc.next.cost) * 100)
    : 0;

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30">
          <Rocket className="w-6 h-6 text-emerald-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">خطة النمو 🚀</h1>
          <p className="text-sm text-slate-400 mt-1">
            خطتك الذكية لتطوير المزرعة
          </p>
        </div>
      </div>

      {/* الميزانية الحالية */}
      <div className="bg-gradient-to-br from-emerald-900/40 via-cyan-900/30 to-emerald-900/40 border-2 border-emerald-500/30 rounded-3xl p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-40 h-40 bg-emerald-500/10 rounded-full blur-3xl" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-emerald-400" />
            <span className="text-xs text-emerald-300 uppercase font-bold tracking-wider">
              ميزانيتك الحالية
            </span>
          </div>
          <div className="text-5xl font-bold text-white mb-2">
            ${budget.toLocaleString()}
          </div>
          <div className="text-sm text-slate-300">
            رأس المال المستثمر:{" "}
            <span className="text-emerald-400 font-bold">${settings.capital}</span>
          </div>
        </div>
      </div>

      {/* الإحصائيات */}
      <div className="grid grid-cols-2 gap-3">
        <StatBox
          icon={<DollarSign className="w-5 h-5" />}
          label="الربح اليومي"
          value={`$${dailyProfit.toFixed(2)}`}
          color="green"
        />
        <StatBox
          icon={<Calendar className="w-5 h-5" />}
          label="الربح الشهري"
          value={`$${calc.monthlyProfit.toFixed(0)}`}
          color="blue"
        />
        <StatBox
          icon={<TrendingUp className="w-5 h-5" />}
          label="الربح السنوي"
          value={`$${calc.yearlyProfit.toFixed(0)}`}
          color="purple"
        />
        <StatBox
          icon={<Target className="w-5 h-5" />}
          label="الهدف الشهري"
          value={`$${monthlyGoal}`}
          color="yellow"
        />
      </div>

      {/* الهدف القادم */}
      {calc.next && (
        <div className="bg-gradient-to-br from-purple-900/40 to-pink-900/30 border-2 border-purple-500/40 rounded-3xl p-6 relative overflow-hidden">
          <div className="absolute -top-4 -right-4 w-32 h-32 bg-purple-500/20 rounded-full blur-3xl animate-pulse" />

          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-yellow-400 animate-pulse" />
                <span className="text-xs font-bold text-yellow-400 uppercase tracking-wider">
                  هدفك القادم
                </span>
              </div>
              <span className="text-xs px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                {calc.daysToNext} يوم
              </span>
            </div>

            <div className="flex items-center gap-3 mb-4">
              <div className={`p-3 rounded-xl bg-${calc.next.color}-500/20 border border-${calc.next.color}-500/30`}>
                <calc.next.icon className={`w-6 h-6 text-${calc.next.color}-400`} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">{calc.next.title}</h3>
                <p className="text-xs text-slate-400">{calc.next.description}</p>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-2 text-xs">
                <span className="text-slate-400">${budget}</span>
                <span className="text-purple-300 font-bold">{nextProgress.toFixed(0)}%</span>
                <span className="text-slate-400">${calc.next.cost}</span>
              </div>
              <div className="h-3 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-1000 relative"
                  style={{ width: `${nextProgress}%` }}
                >
                  <div className="absolute inset-0 bg-white/20 animate-pulse" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-4">
              <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800">
                <div className="text-xs text-slate-400">المتبقي</div>
                <div className="text-lg font-bold text-yellow-400">
                  ${(calc.next.cost - budget).toFixed(0)}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800">
                <div className="text-xs text-slate-400">الفائدة</div>
                <div className="text-lg font-bold text-green-400">
                  {calc.next.benefit}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* خطوات الخطة */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-cyan-400" />
          <h2 className="text-lg font-bold text-white">خطوات النمو الموصى بها</h2>
        </div>

        <div className="space-y-3">
          {MILESTONES.map((milestone, index) => {
            const isAffordable = milestone.cost <= budget;
            const Icon = milestone.icon;
            const daysNeeded = isAffordable
              ? 0
              : Math.ceil((milestone.cost - budget) / dailyProfit);

            return (
              <div
                key={milestone.id}
                className={`relative rounded-2xl p-4 border-2 transition-all ${
                  isAffordable
                    ? "bg-green-500/5 border-green-500/30 hover:border-green-500/50"
                    : "bg-zinc-900/50 border-zinc-800 hover:border-zinc-700"
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* رقم الخطوة */}
                  <div
                    className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center font-bold ${
                      isAffordable
                        ? "bg-green-500/20 text-green-400 border border-green-500/30"
                        : "bg-zinc-800 text-zinc-400 border border-zinc-700"
                    }`}
                  >
                    {isAffordable ? <CheckCircle2 className="w-5 h-5" /> : index + 1}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="font-bold text-white text-sm">
                        {milestone.title}
                      </h3>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 whitespace-nowrap">
                        ${milestone.cost}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mb-2">
                      {milestone.description}
                    </p>

                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-xs text-green-400 font-bold flex items-center gap-1">
                        <ArrowUp className="w-3 h-3" />
                        {milestone.benefit}
                      </span>
                      {isAffordable ? (
                        <span className="text-xs text-green-400 font-bold">
                          ✓ متاح الآن!
                        </span>
                      ) : (
                        <span className="text-xs text-amber-400">
                          🕒 بعد {daysNeeded} يوم
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* النصيحة الذكية */}
      <div className="bg-gradient-to-br from-blue-900/40 to-cyan-900/30 border border-blue-500/30 rounded-2xl p-5">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-blue-500/20 border border-blue-500/30">
            <Sparkles className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h3 className="font-bold text-white mb-1">💡 نصيحة ذكية</h3>
            <p className="text-sm text-slate-300 leading-relaxed">
              {budget < 100
                ? "ابدأ بالتجميع! استمر في التعدين حتى تجمع $100 على الأقل، ثم فكر في التوسع."
                : budget < 300
                ? `ممتاز! بـ $${budget} تقدر تضيف لوح شمسي ($50) لتقليل التكاليف. هذا أفضل استثمار الآن.`
                : budget < 500
                ? `عندك $${budget}! وقت الترقية. فكر في إضافة GPU ثاني (RTX 3060 Ti = $170) لمضاعفة الأرباح.`
                : `رائع! $${budget} كافي لتوسعة كبيرة. اختر بين RTX 3080 + بطارية، أو 2 GPUs متوسطة.`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatBox({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: "green" | "blue" | "purple" | "yellow";
}) {
  const colors = {
    green: "from-green-500/10 to-emerald-500/10 border-green-500/20 text-green-400",
    blue: "from-blue-500/10 to-cyan-500/10 border-blue-500/20 text-blue-400",
    purple: "from-purple-500/10 to-pink-500/10 border-purple-500/20 text-purple-400",
    yellow: "from-yellow-500/10 to-orange-500/10 border-yellow-500/20 text-yellow-400",
  };

  return (
    <div className={`bg-gradient-to-br ${colors[color]} border rounded-2xl p-4`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={colors[color].split(" ")[3]}>{icon}</div>
        <span className="text-xs text-slate-400">{label}</span>
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
    </div>
  );
}