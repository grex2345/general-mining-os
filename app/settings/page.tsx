'use client'

import { useState, useEffect } from 'react'

export default function SettingsPage() {
  const [settings, setSettings] = useState({
    currentMiningCoin: 'KAS',
    electricityCost: 0.12,
    safeMode: true,
    minSwitchProfit: 8,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  // 📥 جلب الإعدادات الحالية
  useEffect(() => {
    fetch('/api/settings')
      .then((res) => res.json())
      .then((data) => {
        setSettings(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  // 💾 حفظ الإعدادات
  const handleSave = async () => {
    setSaving(true)
    setMessage('')
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (res.ok) {
        setMessage('✅ تم الحفظ بنجاح!')
        setTimeout(() => setMessage(''), 3000)
      } else {
        setMessage('❌ فشل الحفظ')
      }
    } catch {
      setMessage('❌ خطأ في الاتصال')
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="p-8 text-center text-gray-400">
        ⏳ جاري التحميل...
      </div>
    )
  }

  return (
    <div className="p-8 max-w-3xl mx-auto" dir="rtl">
      <h1 className="text-3xl font-bold mb-2">⚙️ الإعدادات</h1>
      <p className="text-gray-400 mb-8">تحكم في إعدادات GENERAL MINING OS</p>

      {/* 💎 العملة الحالية */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-4">
        <label className="block text-sm font-semibold mb-2">
          💎 العملة الحالية
        </label>
        <select
          value={settings.currentMiningCoin}
          onChange={(e) =>
            setSettings({ ...settings, currentMiningCoin: e.target.value })
          }
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white"
        >
          <option value="KAS">KAS - Kaspa</option>
          <option value="ERGO">ERGO - Ergo</option>
          <option value="RVN">RVN - Ravencoin</option>
          <option value="ETC">ETC - Ethereum Classic</option>
          <option value="ALPH">ALPH - Alephium</option>
        </select>
      </div>

      {/* 💰 سعر الكهرباء */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-4">
        <label className="block text-sm font-semibold mb-2">
          💰 سعر الكهرباء ($/kWh)
        </label>
        <input
          type="number"
          step="0.01"
          value={settings.electricityCost}
          onChange={(e) =>
            setSettings({
              ...settings,
              electricityCost: parseFloat(e.target.value),
            })
          }
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white"
        />
        <p className="text-xs text-gray-500 mt-2">
          متوسط المغرب: 0.12 $ / kWh
        </p>
      </div>

      {/* 📊 الحد الأدنى للتبديل */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-4">
        <label className="block text-sm font-semibold mb-2">
          📊 الحد الأدنى للتبديل (%)
        </label>
        <input
          type="number"
          step="1"
          value={settings.minSwitchProfit}
          onChange={(e) =>
            setSettings({
              ...settings,
              minSwitchProfit: parseFloat(e.target.value),
            })
          }
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white"
        />
        <p className="text-xs text-gray-500 mt-2">
          لن يقترح التبديل إلا إذا كان الفرق أكبر من هذه النسبة
        </p>
      </div>

      {/* 🛡️ الوضع الآمن */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
        <label className="flex items-center justify-between cursor-pointer">
          <div>
            <div className="font-semibold">🛡️ الوضع الآمن</div>
            <p className="text-xs text-gray-500 mt-1">
              يحمي من التبديل المتكرر والقرارات المتسرعة
            </p>
          </div>
          <input
            type="checkbox"
            checked={settings.safeMode}
            onChange={(e) =>
              setSettings({ ...settings, safeMode: e.target.checked })
            }
            className="w-6 h-6"
          />
        </label>
      </div>

      {/* 💾 زر الحفظ */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-bold py-4 rounded-xl transition"
      >
        {saving ? '⏳ جاري الحفظ...' : '💾 حفظ الإعدادات'}
      </button>

      {/* رسالة النجاح */}
      {message && (
        <div className="mt-4 p-4 bg-zinc-800 rounded-lg text-center">
          {message}
        </div>
      )}
    </div>
  )
}