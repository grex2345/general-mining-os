"use client";

import { useState } from "react";
import {
  Cpu,
  Zap,
  Thermometer,
  Activity,
  Plus,
  Settings,
  MoreVertical,
  Power,
  Wind,
} from "lucide-react";
import { useSimulatedWorkers } from "@/lib/hooks/useSimulatedMarket";
import { useDemoMode } from "@/components/providers/demo-provider";

// 🎨 بيانات افتراضية (للـ Live Mode)
const DEFAULT_WORKERS = [
  {
    id: "rig-001",
    name: "جهاز التعدين ألفا",
    gpu: "NVIDIA RTX 4090 ×2",
    status: "online",
    hashrate: 242.5,
    power: 890,
    fanSpeed: 72,
    temp: 58,
    coin: "ETC",
    pool: "ethermine.org",
    uptime: "45d 12h 34m",
    chart: [40, 55, 45, 60, 50, 65, 55, 70, 60, 75, 65, 80],
  },
  {
    id: "rig-002",
    name: "جهاز التعدين بيتا",
    gpu: "NVIDIA RTX 3080 ×6",
    status: "online",
    hashrate: 584.2,
    power: 1840,
    fanSpeed: 85,
    temp: 65,
    coin: "RVN",
    pool: "2miners.com",
    uptime: "32d 8h 15m",
    chart: [60, 70, 65, 75, 70, 80, 75, 85, 80, 90, 85, 95],
  },
  {
    id: "rig-003",
    name: "جهاز التعدين غاما",
    gpu: "NVIDIA RTX 3070 ×8",
    status: "warning",
    hashrate: 488.0,
    power: 1120,
    fanSpeed: 95,
    temp: 74,
    coin: "ERG",
    pool: "herominers.com",
    uptime: "12d 4h 52m",
    chart: [50, 65, 55, 70, 60, 75, 65, 80, 70, 85, 75, 90],
  },
  {
    id: "rig-004",
    name: "جهاز التعدين إبسيلون",
    gpu: "NVIDIA RTX 4070 Ti ×3",
    status: "online",
    hashrate: 186.3,
    power: 630,
    fanSpeed: 68,
    temp: 60,
    coin: "KAS",
    pool: "kaspa-pool.org",
    uptime: "8d 16h 22m",
    chart: [30, 45, 35, 50, 40, 55, 45, 60, 50, 65, 55, 70],
  },
  {
    id: "rig-005",
    name: "جهاز التعدين دلتا",
    gpu: "AMD RX 6800 XT ×4",
    status: "offline",
    hashrate: 0,
    power: 0,
    fanSpeed: 0,
    temp: 0,
    coin: "—",
    pool: "—",
    uptime: "0",
    chart: [],
  },
];

// 🎨 مكون mini chart
function MiniChart({ data, color }: { data: number[]; color: string }) {
  if (data.length === 0) {
    return (
      <div className="h-16 flex items-center justify-center text-zinc-600 text-xs">
        لا توجد بيانات
      </div>
    );
  }

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const width = 280;
  const height = 60;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <defs>
        <linearGradient id={`gradient-${color}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline fill="none" stroke={color} strokeWidth="2" points={points} />
      <polygon fill={`url(#gradient-${color})`} points={`0,${height} ${points} ${width},${height}`} />
    </svg>
  );
}

export default function WorkersPage() {
  const { isDemo } = useDemoMode();
  const sim = useSimulatedWorkers(5000);

  // 🔄 في Demo Mode: نولّد worker واحد حي + باقي الـ workers الافتراضيين متغيرين قليلاً
  const workers = sim
    ? [
        {
          id: sim.workers[0].id,
          name: "Rig-RTX-3070 (مزرعتك)",
          gpu: "NVIDIA RTX 3070 ×1",
          status: sim.workers[0].status,
          hashrate: sim.workers[0].hashrate,
          power: sim.workers[0].power,
          fanSpeed: Math.round(60 + (sim.workers[0].temperature - 60) * 2),
          temp: Math.round(sim.workers[0].temperature),
          coin: sim.workers[0].coin,
          pool: "herominers.com",
          uptime: sim.workers[0].uptime,
          chart: [55, 60, 58, 62, 59, 61, 60, 63, 61, 60, 62, sim.workers[0].hashrate],
        },
        ...DEFAULT_WORKERS.slice(1),
      ]
    : DEFAULT_WORKERS;

  const onlineCount = workers.filter((w) => w.status === "online").length;
  const warningCount = workers.filter((w) => w.status === "warning").length;
  const offlineCount = workers.filter((w) => w.status === "offline").length;

  const totalHashrate = workers.reduce((sum, w) => sum + w.hashrate, 0);
  const totalPower = workers.reduce((sum, w) => sum + w.power, 0);
  const avgTemp = workers.filter((w) => w.temp > 0).reduce((sum, w, _, arr) => sum + w.temp / arr.length, 0);

  return (
    <div className="space-y-6">
      {/* 🎯 Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-purple-500/10 p-3 rounded-xl border border-purple-500/20">
            <Settings className="w-6 h-6 text-purple-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">الأجهزة</h1>
            <p className="text-sm text-zinc-400">
              إدارة ومراقبة أجهزة التعدين
              {isDemo && <span className="text-green-400 mr-2">• 🟢 بيانات حية</span>}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Demo Mode Indicator */}
          <div
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border ${
              isDemo
                ? "bg-green-500/10 border-green-500/30 text-green-400"
                : "bg-blue-500/10 border-blue-500/30 text-blue-400"
            }`}
          >
            <div className={`w-2 h-2 rounded-full ${isDemo ? "bg-green-400 animate-pulse" : "bg-blue-400"}`} />
            <span className="text-sm font-medium">{isDemo ? "الوضع التجريبي" : "الوضع الحقيقي"}</span>
          </div>

          {/* Add Device */}
          <button className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-bold px-4 py-2 rounded-lg transition shadow-lg shadow-purple-500/20">
            <Plus className="w-4 h-4" />
            <span className="text-sm">إضافة جهاز</span>
          </button>
        </div>
      </div>

      {/* 📊 Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Devices"
          value={workers.length.toString()}
          subValue={`${onlineCount} متصل`}
          icon={<Settings className="w-5 h-5" />}
          color="purple"
        />
        <StatCard
          label="Total Power"
          value={totalPower.toLocaleString()}
          unit="W"
          icon={<Zap className="w-5 h-5" />}
          color="yellow"
        />
        <StatCard
          label="Avg Temperature"
          value={avgTemp.toFixed(1)}
          unit="°C"
          icon={<Thermometer className="w-5 h-5" />}
          color={avgTemp >= 70 ? "yellow" : "green"}
        />
        <StatCard
          label="Total Hashrate"
          value={totalHashrate.toFixed(1)}
          unit="MH/s"
          subValue={isDemo ? "متغير حياً" : "+5.2% من الأمس"}
          icon={<Activity className="w-5 h-5" />}
          color="purple"
        />
      </div>

      {/* 📢 Sponsored Banner */}
      <div className="bg-gradient-to-r from-green-900/20 to-emerald-900/20 border border-green-500/20 rounded-xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-green-500/10 p-2 rounded-lg">
            <Zap className="w-5 h-5 text-green-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-white">2miners</h3>
              <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded">Sponsored</span>
            </div>
            <p className="text-sm text-zinc-400">أفضل مجمع تعدين للمبتدئين</p>
          </div>
        </div>
        <a
          href="https://2miners.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-green-400 hover:text-green-300 text-sm font-medium flex items-center gap-1"
        >
          تفضل بزيارة ↗
        </a>
      </div>

      {/* 🔌 إعدادات الاتصال - تظهر فقط في Live Mode */}
      {!isDemo && (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
          <div className="flex items-start justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="bg-purple-500/10 p-2 rounded-lg border border-purple-500/20">
                <Settings className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <h3 className="font-bold text-white">إعدادات الاتصال</h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  اربط أجهزتك عبر HiveOS أو MinerStat
                </p>
              </div>
            </div>
            <span className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border bg-zinc-800 text-zinc-400 border-zinc-700">
              <div className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
              غير متصل
            </span>
          </div>

          <div className="space-y-4">
            <div>
              <label className="flex items-center justify-between text-xs font-medium text-zinc-400 mb-2">
                <span>🔑 رمز HiveOS API</span>
                <a
                  href="https://hiveos.farm"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-400 hover:text-purple-300"
                >
                  كيفية الحصول على الرمز ↗
                </a>
              </label>
              <input
                type="password"
                placeholder="أدخل رمز API الخاص بك"
                className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg px-4 py-3 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-purple-500/50"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-zinc-400 mb-2 block">
                # معرف المزرعة (Farm ID)
              </label>
              <input
                type="text"
                placeholder="مثال: 123456"
                className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg px-4 py-3 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-purple-500/50"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-zinc-400 mb-2 block">
                🌐 عنوان IP (اختياري - للأجهزة المحلية)
              </label>
              <input
                type="text"
                placeholder="مثال: 192.168.1.100"
                className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg px-4 py-3 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-purple-500/50"
              />
            </div>

            <button className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-bold py-3 rounded-lg transition shadow-lg shadow-purple-500/20 flex items-center justify-center gap-2">
              <Zap className="w-4 h-4" />
              اختبار الاتصال
            </button>

            <p className="text-xs text-zinc-500 text-center">
              احصل على رمز API من{" "}
              <a
                href="https://hiveos.farm"
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-400 hover:text-purple-300 underline"
              >
                hiveos.farm
              </a>{" "}
              {">"} الإعدادات {">"} API
            </p>
          </div>
        </div>
      )}

      {/* 🖥️ Workers List */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">
            الأجهزة المتصلة <span className="text-zinc-500 text-base">({workers.length})</span>
          </h2>
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-green-400" />
              <span className="text-zinc-400">{onlineCount} متصل</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-yellow-400" />
              <span className="text-zinc-400">{warningCount} تحذير</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-red-400" />
              <span className="text-zinc-400">{offlineCount} غير متصل</span>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {workers.map((worker) => (
            <WorkerCard key={worker.id} worker={worker} />
          ))}
        </div>
      </div>
    </div>
  );
}

// 📊 Stat Card Component
function StatCard({
  label,
  value,
  unit,
  subValue,
  icon,
  color,
}: {
  label: string;
  value: string;
  unit?: string;
  subValue?: string;
  icon: React.ReactNode;
  color: "purple" | "yellow" | "green";
}) {
  const colors = {
    purple: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    yellow: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    green: "bg-green-500/10 text-green-400 border-green-500/20",
  };

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5">
      <div className="flex items-start justify-between mb-3">
        <div className="text-sm text-zinc-400">{label}</div>
        <div className={`p-2 rounded-lg border ${colors[color]}`}>{icon}</div>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-3xl font-bold text-white">{value}</span>
        {unit && <span className="text-sm text-zinc-500">{unit}</span>}
      </div>
      {subValue && <div className="text-xs text-green-400 mt-2">↑ {subValue}</div>}
    </div>
  );
}

// 🖥️ Worker Card Component
function WorkerCard({ worker }: { worker: typeof DEFAULT_WORKERS[0] }) {
  const statusConfig = {
    online: { label: "متصل", color: "bg-green-500/10 text-green-400 border-green-500/30", dot: "bg-green-400" },
    warning: { label: "تحذير", color: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30", dot: "bg-yellow-400" },
    offline: { label: "غير متصل", color: "bg-zinc-700 text-zinc-400 border-zinc-600", dot: "bg-zinc-500" },
  };

  const status = statusConfig[worker.status as keyof typeof statusConfig];
  const tempColor =
    worker.temp >= 75 ? "text-red-400" : worker.temp >= 65 ? "text-yellow-400" : "text-green-400";
  const tempBg =
    worker.temp >= 75
      ? "bg-red-500/10 border-red-500/20"
      : worker.temp >= 65
      ? "bg-yellow-500/10 border-yellow-500/20"
      : "bg-green-500/10 border-green-500/20";
  const chartColor = worker.status === "warning" ? "#facc15" : "#a855f7";

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 hover:border-purple-500/30 transition rounded-xl p-5">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-start gap-3">
          <div className="bg-purple-500/10 p-2 rounded-lg border border-purple-500/20">
            <Cpu className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h3 className="font-bold text-white text-sm">{worker.name}</h3>
            <p className="text-xs text-zinc-500">{worker.gpu}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border ${status.color}`}>
            <div className={`w-1.5 h-1.5 rounded-full ${status.dot} ${worker.status === "online" ? "animate-pulse" : ""}`} />
            {status.label}
          </span>
          <button className="text-zinc-500 hover:text-white">
            <MoreVertical className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="mb-4 -mx-2">
        <MiniChart data={worker.chart} color={chartColor} />
      </div>

      <div className="grid grid-cols-4 gap-2 mb-4">
        <div className="bg-zinc-800/50 rounded-lg p-2 text-center border border-zinc-700/50">
          <Activity className="w-3 h-3 text-purple-400 mx-auto mb-1" />
          <div className="text-sm font-bold text-white">{worker.hashrate || "—"}</div>
          <div className="text-[10px] text-zinc-500">MH/s</div>
        </div>
        <div className="bg-zinc-800/50 rounded-lg p-2 text-center border border-zinc-700/50">
          <Zap className="w-3 h-3 text-yellow-400 mx-auto mb-1" />
          <div className="text-sm font-bold text-white">{worker.power || "—"}</div>
          <div className="text-[10px] text-zinc-500">واط</div>
        </div>
        <div className="bg-zinc-800/50 rounded-lg p-2 text-center border border-zinc-700/50">
          <Wind className="w-3 h-3 text-blue-400 mx-auto mb-1" />
          <div className="text-sm font-bold text-white">{worker.fanSpeed ? `${worker.fanSpeed}%` : "—"}</div>
          <div className="text-[10px] text-zinc-500">مروحة</div>
        </div>
        <div className={`rounded-lg p-2 text-center border ${tempBg}`}>
          <Thermometer className={`w-3 h-3 ${tempColor} mx-auto mb-1`} />
          <div className={`text-sm font-bold ${tempColor}`}>{worker.temp ? `${worker.temp}°` : "—"}</div>
          <div className="text-[10px] text-zinc-500">حرارة</div>
        </div>
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-zinc-800">
        <div className="flex items-center gap-2">
          <Power className="w-3 h-3 text-purple-400" />
          <div>
            <div className="text-xs font-bold text-white">{worker.coin}</div>
            <div className="text-[10px] text-zinc-500">{worker.pool}</div>
          </div>
        </div>
        <div className="text-left">
          <div className="text-xs font-mono text-white">{worker.uptime}</div>
          <div className="text-[10px] text-zinc-500">وقت التشغيل</div>
        </div>
      </div>
    </div>
  );
}