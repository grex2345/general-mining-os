"use client";

import { TrendingUp, Construction, Bell, ArrowLeft } from "lucide-react";
import Link from "next/link";

// ═══════════════════════════════════════════════════════════════
// 📈 TRENDS PAGE (Coming Soon)
// ═══════════════════════════════════════════════════════════════
export default function TrendsPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-2xl w-full">
        <div className="bg-[#0d0d14]/60 backdrop-blur-xl border border-white/[0.06] rounded-2xl p-10 text-center">
          {/* Icon */}
          <div className="relative inline-block mb-6">
            <div className="absolute inset-0 bg-amber-500/30 blur-2xl" />
            <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/30 mx-auto">
              <Construction className="w-10 h-10 text-black" strokeWidth={2.5} />
            </div>
          </div>

          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded-full text-xs font-bold uppercase tracking-wider mb-4">
            <TrendingUp className="w-3 h-3" />
            قريباً
          </div>

          {/* Title */}
          <h1 className="text-3xl font-bold text-white mb-3">
            صفحة الاتجاهات
          </h1>

          <p className="text-slate-400 mb-8 max-w-lg mx-auto leading-relaxed">
            نعمل على بناء صفحة احترافية لتحليل اتجاهات السوق على المدى الطويل،
            مع رسوم بيانية تفاعلية ومؤشرات متقدمة
          </p>

          {/* Features preview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-8">
            {[
              { icon: "📊", label: "رسوم بيانية" },
              { icon: "📈", label: "مؤشرات فنية" },
              { icon: "🎯", label: "توقعات ذكية" },
            ].map((feature) => (
              <div
                key={feature.label}
                className="bg-white/[0.03] border border-white/[0.04] rounded-lg p-4"
              >
                <div className="text-3xl mb-2">{feature.icon}</div>
                <div className="text-sm text-slate-400 font-medium">{feature.label}</div>
              </div>
            ))}
          </div>

          {/* CTA */}
          <Link
            href="/radar"
            className="
              inline-flex items-center gap-2 px-6 py-3
              bg-emerald-500/15 hover:bg-emerald-500/25
              text-emerald-400 border border-emerald-500/30
              rounded-lg font-medium text-sm
              transition-all
            "
          >
            <span>اذهب إلى الرادار الآن</span>
            <ArrowLeft className="w-4 h-4" />
          </Link>

          {/* Notify me */}
          <div className="mt-6 pt-6 border-t border-white/[0.06]">
            <button className="inline-flex items-center gap-2 text-xs text-slate-500 hover:text-slate-300 transition-colors">
              <Bell className="w-3.5 h-3.5" />
              أبلغني عند الإطلاق
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}