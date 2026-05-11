"use client";

import { useState, useRef, useEffect } from "react";
import {
  Brain,
  Send,
  Loader2,
  Sparkles,
  TrendingUp,
  Lightbulb,
  Target,
  Zap,
  User,
  Bot,
} from "lucide-react";
import { useSettings } from "@/components/providers/settings-provider";

type Message = {
  id: string;
  role: "user" | "ai";
  content: string;
  timestamp: number;
};

const QUICK_QUESTIONS = [
  { icon: TrendingUp, text: "كيف أزيد أرباحي؟", color: "green" },
  { icon: Lightbulb, text: "أي عملة الأفضل الآن؟", color: "yellow" },
  { icon: Target, text: "خطتي للشهر القادم؟", color: "purple" },
  { icon: Zap, text: "كيف أوفر الكهرباء؟", color: "orange" },
];

export default function AICoachPage() {
  const { settings } = useSettings();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // رسالة ترحيب أول مرة
    if (messages.length === 0) {
      setTimeout(() => {
        setMessages([
          {
            id: "welcome",
            role: "ai",
            content: `مرحباً يا الجنرال! 👑\n\nأنا المدرب الذكي، حللت بياناتك:\n• ميزانيتك: $${settings.budget}\n• رأس المال: $${settings.capital}\n• ${settings.gpuCount}× ${settings.gpuType}\n\nاسألني أي شي عن مزرعتك! 🚀`,
            timestamp: Date.now(),
          },
        ]);
      }, 500);
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const generateResponse = (question: string): string => {
    const q = question.toLowerCase();

    // تحليل ذكي حسب السؤال
    if (q.includes("ربح") || q.includes("أرباح") || q.includes("أزيد")) {
      const dailyProfit = 0.65;
      const monthlyProfit = dailyProfit * 30;
      return `📊 **تحليل أرباحك:**\n\nربحك اليومي الحالي: $${dailyProfit}\nالشهري: $${monthlyProfit.toFixed(0)}\nالسنوي: $${(dailyProfit * 365).toFixed(0)}\n\n💡 **3 طرق لزيادة الأرباح:**\n\n1️⃣ **Undervolt الـ GPU** (-15% طاقة، نفس الهاش)\n2️⃣ **بدّل لـ KAS** عند صعود السوق (+30%)\n3️⃣ **عدّن في ذروة الشمس** فقط لتقليل تكلفة الكهرباء\n\n🎯 بهذي الطرق، ممكن تزيد أرباحك بنسبة 40%!`;
    }

    if (q.includes("عملة") || q.includes("أفضل")) {
      return `🪙 **تحليل العملات للـ ${settings.gpuType}:**\n\n🥇 **ERGO** (الأفضل حالياً)\n• ربح: $0.65/يوم\n• استقرار: عالي\n• Difficulty: متوسط\n\n🥈 **KAS** (فرصة صاعدة)\n• ربح: $0.58/يوم\n• تذبذب: عالي لكن صاعد\n• 24h: +12%\n\n🥉 **ETC** (بديل آمن)\n• ربح: $0.42/يوم\n• استقرار: ممتاز\n\n💡 **توصيتي:** ابقَ على ERGO، وراقب KAS عن كثب.`;
    }

    if (q.includes("خطة") || q.includes("شهر")) {
      const budget = settings.budget;
      const target = budget + 20;
      return `🎯 **خطتك للشهر القادم:**\n\n**الوضع الحالي:**\n• ميزانية: $${budget}\n• هدف شهري: $${settings.monthlyGoal}\n\n**الخطة (30 يوم):**\n\n📅 **الأسبوع 1:** عدّن ERGO، اجمع $${(0.65 * 7).toFixed(0)}\n📅 **الأسبوع 2:** إذا KAS صعدت، بدّل\n📅 **الأسبوع 3:** Undervolt للتوفير\n📅 **الأسبوع 4:** اجمع لشراء RTX 3060 Ti\n\n💰 **المتوقع نهاية الشهر:** $${target}\n\n✅ بعد 60 يوم: تقدر تضيف GPU ثاني!`;
    }

    if (q.includes("كهرباء") || q.includes("أوفر") || q.includes("توفير")) {
      const monthlyCost = 130 * 24 * 30 * settings.electricityPrice / 1000;
      return `⚡ **تحليل استهلاك الكهرباء:**\n\n• استهلاك يومي: ~3.1 kWh\n• تكلفة شهرية: $${monthlyCost.toFixed(2)}\n• تكلفة سنوية: $${(monthlyCost * 12).toFixed(2)}\n\n💡 **5 طرق للتوفير:**\n\n1️⃣ **Undervolt** (-20% طاقة)\n2️⃣ **عدّن في النهار** فقط (طاقة شمسية مجانية)\n3️⃣ **أضف لوح شمسي** ($50 يوفر $5/شهر)\n4️⃣ **بطارية للتعدين الليلي** (يوفر $15/شهر)\n5️⃣ **ضبط Power Limit** على 70%\n\n🎯 **الوفر المحتمل:** $${(monthlyCost * 0.4).toFixed(2)}/شهر`;
    }

    // رد افتراضي ذكي
    return `🤔 سؤال ممتاز يا الجنرال!\n\nبناءً على بياناتك:\n• ميزانية: $${settings.budget}\n• ${settings.gpuCount}× ${settings.gpuType}\n• كهرباء: $${settings.electricityPrice}/kWh\n\n💡 **توصياتي العامة:**\n\n1. حافظ على الحرارة تحت 75°C\n2. عدّن ERGO حالياً (الأفضل لـ RTX)\n3. راقب KAS لفرصة تبديل\n4. اجمع $200 لإضافة GPU ثاني\n\n✨ اسألني سؤال محدد وراح أحلل أكثر!`;
  };

  const handleSend = async (text?: string) => {
    const question = text || input.trim();
    if (!question || loading) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: question,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    // محاكاة AI processing
    await new Promise((r) => setTimeout(r, 1500));

    const aiMsg: Message = {
      id: `ai-${Date.now()}`,
      role: "ai",
      content: generateResponse(question),
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, aiMsg]);
    setLoading(false);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-200px)] max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="p-3 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/30 animate-glow-pulse">
          <Brain className="w-6 h-6 text-purple-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">المدرب الذكي 🧠</h1>
          <p className="text-sm text-slate-400 mt-1">
            مساعدك الشخصي للتعدين الذكي
          </p>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-4 px-1">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 ${
              msg.role === "user" ? "flex-row-reverse" : "flex-row"
            } animate-bounce-in`}
          >
            <div
              className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${
                msg.role === "user"
                  ? "bg-blue-500/20 border border-blue-500/30"
                  : "bg-purple-500/20 border border-purple-500/30"
              }`}
            >
              {msg.role === "user" ? (
                <User className="w-4 h-4 text-blue-400" />
              ) : (
                <Bot className="w-4 h-4 text-purple-400" />
              )}
            </div>
            <div
              className={`flex-1 max-w-[80%] rounded-2xl p-4 ${
                msg.role === "user"
                  ? "bg-blue-500/10 border border-blue-500/20 text-right"
                  : "bg-zinc-900/60 border border-zinc-800"
              }`}
            >
              <div className="text-sm text-white whitespace-pre-line leading-relaxed">
                {msg.content}
              </div>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex gap-3 animate-bounce-in">
            <div className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center bg-purple-500/20 border border-purple-500/30">
              <Bot className="w-4 h-4 text-purple-400" />
            </div>
            <div className="flex-1 max-w-[80%] rounded-2xl p-4 bg-zinc-900/60 border border-zinc-800">
              <div className="flex items-center gap-2 text-purple-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">جاري التحليل...</span>
              </div>
              <div className="flex gap-1 mt-2">
                <div className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                <div className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" style={{ animationDelay: "0.2s" }} />
                <div className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" style={{ animationDelay: "0.4s" }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Questions */}
      {messages.length <= 1 && !loading && (
        <div className="grid grid-cols-2 gap-2 mb-3">
          {QUICK_QUESTIONS.map((q, i) => {
            const Icon = q.icon;
            return (
              <button
                key={i}
                onClick={() => handleSend(q.text)}
                className="text-right p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 hover:border-purple-500/30 hover:bg-zinc-800/60 transition-all group"
              >
                <div className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 text-${q.color}-400 group-hover:scale-110 transition`} />
                  <span className="text-xs text-slate-300">{q.text}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Input Area */}
      <div className="flex gap-2 p-2 rounded-2xl bg-zinc-900/60 border border-zinc-800 focus-within:border-purple-500/30">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="اسأل المدرب الذكي..."
          disabled={loading}
          className="flex-1 bg-transparent text-white text-sm focus:outline-none px-3 disabled:opacity-50"
        />
        <button
          onClick={() => handleSend()}
          disabled={loading || !input.trim()}
          className="p-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 text-white animate-spin" />
          ) : (
            <Send className="w-4 h-4 text-white" />
          )}
        </button>
      </div>
    </div>
  );
}