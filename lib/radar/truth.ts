// ═══════════════════════════════════════════
// 🛡️ TRUTH LAYER
// نظام الشفافية: لكل قيمة، نعرف من أين جاءت
// ═══════════════════════════════════════════

import type { DataSource, Reliability, TruthValue } from "./types";

/**
 * إنشاء TruthValue من قيمة
 */
export function makeTruth<T>(
  value: T,
  source: DataSource,
  reliability: Reliability = "medium",
  note?: string
): TruthValue<T> {
  return {
    value,
    source,
    fetchedAt: new Date(),
    reliability,
    note,
  };
}

/**
 * Helpers سريعة لكل نوع
 */
export const live = <T>(v: T, reliability: Reliability = "high"): TruthValue<T> =>
  makeTruth(v, "live", reliability);

export const mock = <T>(v: T, note?: string): TruthValue<T> =>
  makeTruth(v, "mock", "low", note ?? "محاكاة - ليست بيانات حقيقية");

export const manual = <T>(v: T, reliability: Reliability = "high"): TruthValue<T> =>
  makeTruth(v, "manual", reliability, "بيانات مُدخلة يدوياً");

export const estimated = <T>(v: T, note?: string): TruthValue<T> =>
  makeTruth(v, "estimated", "medium", note ?? "تقدير بناءً على بيانات أخرى");

export const stale = <T>(v: T, fetchedAt: Date): TruthValue<T> => ({
  value: v,
  source: "stale",
  fetchedAt,
  reliability: "low",
  note: "بيانات قديمة - قد لا تعكس الوضع الحالي",
});

/**
 * هل البيانات مازالت صالحة؟
 */
export function isFresh(truth: TruthValue<unknown>, maxAgeMinutes: number): boolean {
  const ageMs = Date.now() - truth.fetchedAt.getTime();
  const ageMinutes = ageMs / 1000 / 60;
  return ageMinutes <= maxAgeMinutes;
}

/**
 * تحويل source إلى نص بالعربية للـ UI
 */
export function sourceLabel(source: DataSource): string {
  const labels: Record<DataSource, string> = {
    live: "🟢 حي",
    mock: "🟡 محاكاة",
    manual: "✏️ يدوي",
    estimated: "📊 تقدير",
    stale: "⏰ قديم",
  };
  return labels[source];
}

/**
 * تحويل reliability إلى لون
 */
export function reliabilityColor(reliability: Reliability): string {
  const colors: Record<Reliability, string> = {
    high: "text-green-400 border-green-500/30 bg-green-500/10",
    medium: "text-yellow-400 border-yellow-500/30 bg-yellow-500/10",
    low: "text-red-400 border-red-500/30 bg-red-500/10",
  };
  return colors[reliability];
}