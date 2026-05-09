import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  Thermometer,
  Zap,
  Plug,
  DollarSign,
  Sun,
  Coins,
  Target,
  type LucideIcon,
} from "lucide-react";

export type StatStatus = "good" | "warning" | "danger" | "neutral";

export type StatCardProps = {
  label: string;
  value: string;
  subValue?: string;
  iconName: keyof typeof iconMap;
  status?: StatStatus;
  badgeText?: string;
};

const iconMap = {
  check: CheckCircle2,
  thermometer: Thermometer,
  zap: Zap,
  plug: Plug,
  dollar: DollarSign,
  sun: Sun,
  coins: Coins,
  target: Target,
} satisfies Record<string, LucideIcon>;

const statusStyles: Record<StatStatus, { border: string; icon: string; value: string; badge: "default" | "secondary" | "destructive" | "outline" }> = {
  good:    { border: "border-green-500/30",  icon: "text-green-400",  value: "text-green-400",  badge: "default" },
  warning: { border: "border-yellow-500/30", icon: "text-yellow-400", value: "text-yellow-400", badge: "secondary" },
  danger:  { border: "border-red-500/30",    icon: "text-red-400",    value: "text-red-400",    badge: "destructive" },
  neutral: { border: "border-slate-700",     icon: "text-slate-400",  value: "text-white",      badge: "outline" },
};

export default function StatCard({
  label,
  value,
  subValue,
  iconName,
  status = "neutral",
  badgeText,
}: StatCardProps) {
  const Icon = iconMap[iconName];
  const styles = statusStyles[status];

  return (
    <Card
      className={`bg-slate-900/60 ${styles.border} transition-all hover:scale-[1.02] hover:bg-slate-900/80`}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <p className="text-sm text-slate-400">{label}</p>
          <Icon className={`w-5 h-5 ${styles.icon}`} />
        </div>

        <h2 className={`text-3xl font-bold ${styles.value}`}>{value}</h2>

        <div className="flex items-center justify-between mt-3">
          {subValue && <p className="text-xs text-slate-500">{subValue}</p>}
          {badgeText && (
            <Badge variant={styles.badge} className="text-xs">
              {badgeText}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}