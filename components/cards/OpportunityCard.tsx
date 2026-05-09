import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Lightbulb, AlertTriangle, Sparkles } from "lucide-react";
import type { Opportunity } from "@/lib/engine/opportunity";

const severityConfig = {
  alert: {
    icon: Sparkles,
    color: "text-green-400",
    border: "border-green-500/40",
    bg: "bg-green-500/5",
    badge: "default" as const,
  },
  warning: {
    icon: AlertTriangle,
    color: "text-yellow-400",
    border: "border-yellow-500/40",
    bg: "bg-yellow-500/5",
    badge: "secondary" as const,
  },
  info: {
    icon: Lightbulb,
    color: "text-blue-400",
    border: "border-blue-500/40",
    bg: "bg-blue-500/5",
    badge: "outline" as const,
  },
};

export default function OpportunityCard({ opportunity }: { opportunity: Opportunity }) {
  const cfg = severityConfig[opportunity.severity];
  const Icon = cfg.icon;

  return (
    <Card className={`bg-slate-900/60 ${cfg.border}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg ${cfg.bg}`}>
            <Icon className={`w-5 h-5 ${cfg.color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
              <h3 className="text-sm font-bold text-white">{opportunity.title}</h3>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">{opportunity.symbol}</Badge>
                <Badge variant={cfg.badge} className="text-xs">
                  ثقة {opportunity.confidence}%
                </Badge>
              </div>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed">{opportunity.description}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}