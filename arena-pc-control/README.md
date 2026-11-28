# 🖥️ Arena PC Control — تنفيذ حقيقي على جهازك، بعقل Arena.ai

نظام محلي آمن يربط **وكيل Arena.ai** (وهو الدماغ الوحيد) بجهازك **Windows 10/11**
عبر إضافة Chrome/Edge + جسر محلي (Local Bridge) + خادم أدوات **MCP**.

---

## 🧠 المبدأ: الوكيل الموجود في Arena هو الدماغ

نحن لا نبني ذكاءً اصطناعياً جديداً ولا نحتاج أي مفتاح API (لا OpenAI، لا Anthropic،
لا Gemini، لا Ollama). الوكيل داخل Arena يقرأ الأدوات، يخطّط، يطلب تنفيذها، ثم
يقرأ النتيجة ويقرّر الخطوة التالية.

| المكوّن | المسؤولية |
|---|---|
| **وكيل Arena.ai** (الدماغ) | الفهم، التخطيط، القرار، تحليل النتائج |
| **إضافة Chrome/Edge (MV3)** | الجسر بين صفحة Arena والجسر المحلي، عرض موافقات المستخدم |
| **الجسر المحلي (Bridge)** | المصادقة، الجلسات، توجيه الأدوات، تنفيذ السياسة، سجل التدقيق |
| **خادم الأدوات (MCP `local_pc`)** | 22 أداة على Windows: ملفات، أوامر، تطبيقات، شاشة، ماوس/كيبورد، ذاكرة |

```
USER → Arena.ai Agent → Extension (content script + service worker)
     → ws://127.0.0.1:18765 (Bridge, token + Origin check)
     → MCP Router → local_pc (stdio) → Windows
```

---

## 🚀 التشغيل (Windows 10/11)

1. انسخ مجلد `arena-pc-control` إلى جهازك.
2. شغّل **`start_windows.bat`** أو **`scripts\start.bat`** بنقرة مزدوجة
   (**كمستخدم عادي — ليس Administrator**، البرنامج يرفض العمل بصلاحيات إدارية).
   - ينشئ `.venv`، يثبّت المتطلبات، يحرّر المنفذ 18765، يشغّل الجسر،
     ثم يتحقق فعلياً من أربع طبقات: TCP → WebSocket → المصادقة → الأدوات.
   - يطبع **PAIRING TOKEN** (يُحفظ في `%USERPROFILE%\.arena-pc-control\auth_token.txt`).
3. في Chrome/Edge: `chrome://extensions` → فعّل **Developer mode** →
   **Load unpacked** → اختر مجلد `arena-pc-control\extension`.
4. افتح أيقونة الإضافة، الصق الرمز، اضغط **Save & Pair Bridge**
   (يجب أن تظهر **Paired & Ready** مع عدد الأدوات).
5. افتح `https://arena.ai`، ستظهر لوحة **Arena PC Control** فوق مربع الكتابة.
   اضغط **Start PC Session** ثم أعطِ الوكيل مهمة.

### إيقاف طارئ

```bat
.venv\Scripts\python.exe scripts\emergency_stop.py --activate
.venv\Scripts\python.exe scripts\emergency_stop.py --reset
```

لإيقاف الجسر العادي: `scripts\stop.bat`
للتشخيص: `scripts\doctor.bat` (أو `python scripts\doctor.py --deep`)

---

## 🔐 الأمان

- الجسر يستمع على `127.0.0.1` فقط، ويُرفض أي `Origin` غير إضافة المتصفح.
- رمز إقران 256-bit مع `hmac.compare_digest`.
- يرفض التشغيل بصلاحيات Administrator، ويشغّل نسخة واحدة فقط (قفل ملف).
- **PolicyEngine**: `ALLOW` / `CONFIRM` / `DENY` قبل أي تنفيذ
  (حذف، أوامر خارج القائمة الآمنة، كتابة خارج مجلدات العمل → موافقة بشرية).
- حظر: تصعيد الصلاحيات، تعطيل Defender/UAC، قراءة مخازن الكوكيز/المفاتيح،
  `curl | sh`، عناوين cloud metadata، والوصول المحلي بدون تأكيد.
- سجل تدقيق `~/.arena-pc-control/audit.jsonl` لكل عملية.
- عزل الجلسات: لكل تبويب Arena جلسة مستقلة، والموافقة تُرسل لصاحب الطلب فقط.

---

## 🧪 الاختبارات

```bash
# كل شيء: وحدات + تكامل + الإضافة الحقيقية عبر jsdom مقابل جسر حقيقي
python -m pytest -q            # 112 اختباراً

# اختبار حي على الجهاز نفسه (يكشف قدرات Windows الحقيقية)
python scripts/windows_selftest.py

# فحص الجسر أثناء التشغيل
python scripts/verify_bridge.py --port 18765

# تشخيص شامل عند وجود أي مشكلة (يعطيك سبب المشكلة والحل بالضبط)
python scripts/doctor.py --deep

# أوامر مساعدة
python scripts/bootstrap.py token        # إنشاء/طباعة رمز الإقران
python scripts/bootstrap.py launch       # تشغيل الجسر في الخلفية
python scripts/bootstrap.py stop         # إيقاف الجسر وتحرير المنفذ
python scripts/bootstrap.py status       # حالة الجسر بصيغة JSON
```

`tests/test_extension_e2e.py` يشغّل **ملفات الإضافة الحقيقية** (background.js +
content scripts) داخل صفحة Arena مُحاكاة مقابل **جسر Python حقيقي**، ويتحقق من:
المصادقة، بدء الجلسة، تنفيذ أداة وقراءة النتيجة، بطاقة الموافقة (رفض/قبول)،
التصحيح الذاتي عند JSON خاطئ، عدم تنفيذ ردود غير مكتملة، عزل تبويبين، والإيقاف.

---

## 📋 ما هو مُختبر وما يحتاج جهاز Windows

| المكوّن | الحالة |
|---|---|
| الجسر (مصادقة، جلسات، سياسة، قفل، تدقيق) | ✅ مختبر آلياً |
| محرّك الأدوات (ملفات، shell، شبكة، ذاكرة) | ✅ مختبر آلياً |
| الإضافة (ربط، حلقة تنفيذ، موافقات، عزل تبويبات) | ✅ مختبر آلياً مقابل جسر حقيقي |
| أدوات سطح المكتب (UIA, لقطات شاشة, ماوس/كيبورد, تشغيل تطبيقات) | ⏳ تحتاج جهاز Windows — تُختبر بـ `windows_selftest.py` |
| التكامل مع صفحة Arena.ai الحقيقية (DOM) | ⏳ يحتاج جلسة Arena حقيقية |

---

## 🔧 إعدادات

- `config.default.json` — الإعدادات الافتراضية (منافذ، مهلات، سياسة).
- `config.local.json` — إن وُجد يُستخدم بدلاً منه (لا تُرفعه إلى Git).
- `mcpServers.playwright` — اختياري: تحكّم متصفح كامل عبر `@playwright/mcp` إذا ثُبّت Node.js 20+.
- `mcpServers.windows_mcp` — اختياري: `CursorTouch/Windows-MCP` إذا ثُبّت `uv`.

Documentation: [`docs/ARCHITECTURE_AND_ROADMAP.md`](docs/ARCHITECTURE_AND_ROADMAP.md)
