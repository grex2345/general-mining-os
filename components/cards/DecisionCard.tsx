import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Brain,
  TrendingUp,
  Pause,
  ArrowRightLeft,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
} from "lucide-react";
import type { Decision } from "@/lib/engine/types";

const actionConfig = {
  switch: {
    icon: ArrowRightLeft,
    label: "بدّل العملة",
    color: "text-green-400",
    border: "border-green-500/40",
    bg: "bg-green-500/5",
  },
  stay: {
    icon: TrendingUp,
    label: "ابقَ على العملة",
    color: "text-blue-400",
    border: "border-blue-500/40",
    bg: "bg-blue-500/5",
  },
  wait: {
    icon: Pause,
    label: "انتظر",
    color: "text-yellow-400",
    border: "border-yellow-500/40",
    bg: "bg-yellow-500/5",
  },
} as const;

const riskConfig = {
  low: { icon: ShieldCheck, label: "منخفضة", color: "text-green-400", variant: "default" as const },
  medium: { icon: ShieldAlert, label: "متوسطة", color: "text-yellow-400", variant: "secondary" as const },
  high: { icon: ShieldX, label: "عالية", color: "text-red-400", variant: "destructive" as const },
};

export default function DecisionCard({ decision }: { decision: Decision }) {
  const action = actionConfig[decision.action];
  const ActionIcon = action.icon;
  const risk = riskConfig[decision.risk.level];
  const RiskIcon = risk.icon;

  return (
    <Card className={`${action.border} ${action.bg} bg-slate-900/60`}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg bg-slate-800 ${action.color}`}>
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-slate-400">قرار محرك التوصية</p>
              <h3 className={`text-lg font-bold ${action.color}`}>
                {action.label}
              </h3>
            </div>
          </div>
          <ActionIcon className={`w-8 h-8 ${action.color}`} />
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="p-3 rounded-lg bg-slate-800/50">
            <p className="text-xs text-slate-500 mb-1">الحالية</p>
            <p className="text-xl font-bold text-white">{decision.currentCoin}</p>
          </div>
          <div className="p-3 rounded-lg bg-slate-800/50">
            <p className="text-xs text-slate-500 mb-1">الموصى بها</p>
            <p className={`text-xl font-bold ${action.color}`}>
              {decision.recommendedCoin}
            </p>
          </div>
        </div>

        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-slate-400">مستوى الثقة</p>
            <p className={`text-sm font-bold ${action.color}`}>
              {decision.confidence}%
            </p>
          </div>
          <Progress value={decision.confidence} className="h-2" />
        </div>

        <div className="flex items-center justify-between mb-4 p-3 rounded-lg bg-slate-800/50">
          <div className="flex items-center gap-2">
            <RiskIcon className={`w-4 h-4 ${risk.color}`} />
            <span className="text-xs text-slate-400">المخاطرة:</span>
          </div>
          <Badge variant={risk.variant}>{risk.label}</Badge>
        </div>

        <div className="p-3 rounded-lg bg-slate-800/30 border border-slate-700/50">
          <p className="text-xs font-semibold text-slate-300 mb-2">
            💡 لماذا هذه التوصية؟
          </p>
          <p className="text-sm text-slate-400 leading-relaxed">
            {decision.reason}
          </p>
          {decision.risk.factors.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-700/50">
              <p className="text-xs text-slate-500 mb-1">عوامل المخاطرة:</p>
              <ul className="text-xs text-slate-400 space-y-1">
                {decision.risk.factors.map((f, i) => (
                  <li key={i}>• {f}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}