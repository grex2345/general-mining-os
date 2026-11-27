# 🖥️ Arena PC Control — نظام التحكم الآمن بالحاسوب لـ Arena.ai

نظام معياري ومفتوح المصدر يربط **Arena.ai** بجهازك **Windows 10/11** محلياً عبر بروتوكول **MCP (Model Context Protocol)** مع طبقة حماية وصلاحيات صارمة (**Human-in-the-Loop Policy Gate**)، بدون الحاجة إلى صلاحيات المسؤول (Administrator) أو مفاتيح API مدفوعة.

---

## ✨ ماذا يقدّم هذا النظام مقارنةً بـ ZeroScript؟

1. **تحكم شامل بالحاسوب بدلاً من Roblox فقط**:
   - 📁 **إدارة الملفات والمجلدات** (`fs_list`, `fs_read`, `fs_write`, `fs_edit`, `fs_move`, `fs_mkdir`, `fs_delete`) مع كتابة ذرّية آمنة وتلميحات تصحيح ذاتي عند الخطأ.
   - 🌐 **التحكم الكامل بالمتصفح والويب** (فتح المواقع واليوتيوب عبر `open_url`، قراءة الصفحات عبر `web_fetch_readable`، ودعم مباشر لخادم مايكروسوفت الرسمي `@playwright/mcp` للتصفح التفاعلي والبحث والنقر وملء النماذج).
   - 🪟 **تطبيقات سطح المكتب في Windows 10/11** (`app_list_windows`, `app_launch`, `app_focus_window`, `ui_inspect_window` عبر شجرة الوصول `UI Automation` بدون الحاجة لنموذج رؤية بطيء).
   - 🖱️ **الماوس ولوحة المفاتيح ولقطات الشاشة** (`screen_capture`, `input_mouse` مع مفتاح أمان فوري عند تحريك الماوس للزاوية `(0,0)`, و`input_keyboard`).
   - 💻 **تنفيذ أوامر PowerShell والطرفية الخاضعة للإشراف** (`shell_exec`).
   - 🧠 **ذاكرة دائمة عبر الجلسات والمشاريع** (`memory_save`, `memory_recall`, `memory_list_projects`) مبنية على قاعدة بيانات `SQLite` محلية.
2. **أمان حقيقي (Zero-Trust Local Security)**:
   - ارتباط حصري بـ `127.0.0.1` + فحص `Origin` لمنع أي موقع ويب خبيث من الاتصال بالجسر المحلي.
   - رمز إقران مشفّر 256-bit (`auth_token.txt`).
   - محرك صلاحيات (`PolicyEngine`) يقسم كل عملية إلى 3 مستويات:
     - `ALLOW`: تنفّذ فوراً (القراءة والكتابة داخل مجلدات العمل المسموحة، أوامر الفحص القرائية).
     - `CONFIRM`: توقف التنفيذ وتظهر بطاقة **Approve / Deny** مباشرةً داخل صفحة Arena (الحذف، تثبيت البرامج، الكتابة خارج المجلدات المسموحة، أوامر الشبكة).
     - `DENY`: حظر فوري قاطع (طلب صلاحيات Administrator، تعطيل Windows Defender، الوصول إلى كوكيز المتصفحات أو مفاتيح `.ssh`).

---

## 🚀 طريقة التشغيل على جهازك Windows 10/11 (في 4 خطوات)

### الخطوة 1 — تشغيل الفحص الذاتي والجسر المحلي
1. انسخ مجلد `arena-pc-control` إلى جهازك Windows (مثلاً في `C:\Users\<YourName>\arena-pc-control`).
2. اضغط مرتين على الملف **`start_windows.bat`** (كمستخدم عادي — **لا تشغّله كـ Administrator**).
3. ستظهر نافذة الطرفية وبداخلها رمز **`PAIRING TOKEN`**، انسخه (أبقِ النافذة مفتوحة).
4. *(اختياري للتأكد من كل وظائف Windows)* شغّل الفحص القياسي:
   ```powershell
   .\.venv\Scripts\python.exe scripts\windows_selftest.py
   ```

### الخطوة 2 — تثبيت إضافة المتصفح (Chrome أو Edge)
1. افتح `edge://extensions` أو `chrome://extensions`.
2. فعّل **Developer mode** (وضع المطور).
3. اضغط **Load unpacked** واختر المجلد `arena-pc-control/extension`.
4. اضغط على أيقونة الإضافة **Arena PC Control** في شريط المتصفح، الصق **`PAIRING TOKEN`** واضغط **Save & Pair Bridge** حتى تتحول الحالة إلى اللون الأخضر (`Paired & Ready`).

### الخطوة 3 — تفعيل التحكم المتقدم بالمتصفح (YouTube والبحث والتفاعل) عبر Playwright MCP
إذا كان لديك **Node.js 20+** مثبتاً على جهازك:
1. انسخ `config.default.json` إلى `config.local.json`.
2. غيّر `"enabled": false` تحت `"playwright"` إلى `"enabled": true`.
3. أعد تشغيل `start_windows.bat` — سيظهر لديك تلقائياً كل أدوات `browser_navigate`, `browser_snapshot`, `browser_click`, `browser_type`!

### الخطوة 4 — بدء الجلسة في Arena.ai
1. افتح `https://arena.ai` (وضع المحادثة المباشرة Direct).
2. سيظهر شريط **Arena PC Control** فوق مربع الكتابة بحالة خضراء.
3. اضغط **Start PC Session**، ثم اطلب من Arena ما تريد تنفيذه على جهازك!

---

## 🧪 تشغيل الاختبارات الآلية (Automated Tests)

```bash
pytest -v tests/
node --test tests/test_extension_protocol.mjs
python scripts/windows_selftest.py
```
