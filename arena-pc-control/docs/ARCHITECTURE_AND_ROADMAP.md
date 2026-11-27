# Arena PC Control — Technical Investigation, Architecture & Roadmap (JARVIS Edition)

## 1. Executive Summary

Arena PC Control evolved from a turn-by-turn MCP bridge into a **JARVIS-like autonomous assistant** (`jarvis_core/`). It combines:

- A secure loopback WebSocket bridge with Origin checking and 256-bit token auth (existing)
- A PolicyEngine with ALLOW / CONFIRM / DENY tiers and JSONL audit logging (existing)
- A multi-server MCP router with crash recovery (existing)
- A built-in Windows PC MCP server with 22 tools (existing)
- **NEW: JARVIS Core** — intent analysis, task planning, autonomous execution with verification & recovery, extended persistent memory, self-improvement learning, and an emergency stop kill switch

---

## 2. JARVIS Core — Component Details

### 2.1 Orchestrator (`jarvis_core/orchestrator.py`)
Central brain that wires all subsystems together:
- `execute_objective(objective, project)` — top-level entry point
- Lifecycle: `start()` → `stop()`
- Emergency stop activate/reset/status
- Preference and workflow CRUD

### 2.2 Intent Analyzer (`jarvis_core/reasoning.py`)
- `IntentAnalyzer.analyze(text)` → `IntentAnalysis` with:
  - Intent type classification (file_management, web_research, app_control, development, system_admin, unknown)
  - Confidence score
  - Capability flags (browser, desktop_app, filesystem, shell)
  - Destructive risk detection
  - Entity extraction (URLs, paths, quoted strings)
  - Estimated step count
- `SituationalAwareness` — tracks open windows, focused app, browser state, recent errors, and provides context summary

### 2.3 Task Planner (`jarvis_core/planner.py`)
- `TaskPlanner.plan(intent)` → `Plan` with ordered `TaskStep`s
- Each step: id, description, tool, arguments, expected_outcome, risk_tier, verification, max_retries
- Plans cover: web (open_url + web_fetch_readable), file (fs_list + fs_write), app (app_list_windows + app_launch), shell (diagnostic), default (system_info)
- Always appends a `memory_save` step to persist the plan

### 2.4 Task Engine (`jarvis_core/task_engine.py`)
- `TaskEngine.execute_plan(plan)` → `ExecutionResult`
- Per-step: PolicyEngine check → human approval (if CONFIRM) → MCP tool call → result verification → retry with recovery (up to max_retries)
- Records successes and failures to SelfImprovement and Memory
- Stops immediately on Emergency Stop activation

### 2.5 Extended Memory (`jarvis_core/memory_extended.py`)
Builds on existing `MemoryStore` (SQLite WAL) and adds:
- `save_project_architecture` / `recall_project_architecture`
- `log_decision` / `recall_decisions`
- `log_task_history` / `recall_task_history`
- `log_error_pattern` / `recall_error_patterns`
- `save_user_preference` / `recall_user_preference`
- `save_workflow` / `recall_workflow` / `list_workflows`
- `recall_context` — general cross-category search

### 2.6 Self-Improvement (`jarvis_core/self_improvement.py`)
- `record_success` / `record_failure`
- `suggest_fix(tool, error)` — heuristic fixes first, then stored pattern matching
- `find_reusable_workflow(keywords)`

### 2.7 Emergency Stop (`jarvis_core/emergency_stop.py`)
- Thread-safe persisted kill switch
- `activate(reason)` / `reset(authorized_by)` / `require_running()`
- Survives process restarts via `~/.arena-pc-control/emergency_stop.json`
- Logs activation to `audit.jsonl`

---

## 3. Security Boundaries (Preserved & Enhanced)

| Boundary | Implementation |
|---|---|
| No public internet exposure | Bridge binds to `127.0.0.1` only; `0.0.0.0` rejected at startup |
| Origin hijacking | WebSocket `origins` allowlist: `chrome-extension://`, `moz-extension://`, local CLI only |
| Authentication | 256-bit `secrets.token_urlsafe(32)` pairing token, `hmac.compare_digest` |
| Privilege escalation | `refuseAdminStartup` — bridge refuses to run as Windows Administrator |
| Destructive operations | PolicyEngine CONFIRM tier; human approval modal in Arena extension |
| Credential theft | Hard DENY for `.ssh`, browser cookies, `.ROBLOSECURITY`, system dirs |
| Audit trail | JSONL `audit.jsonl` — every auth, approval, tool execution, denial, and emergency stop |
| Emergency stop | Global kill switch halts all autonomous execution |

---

## 4. Reusable OSS Components vs Custom Builds

| Component | Source | License | Decision |
|---|---|---|---|
| Browser automation with Accessibility Tree | `microsoft/playwright-mcp` | Apache-2.0 | **Reuse** — mount via `npx @playwright/mcp@latest` in `config.local.json` |
| Windows UI Automation MCP | `CursorTouch/Windows-MCP` | MIT | **Reuse optionally** — `uvx windows-mcp`; also built-in Python 3.10+ UIA tools in `builtin_mcp_server.py` |
| JSON-RPC 2.0 stdio MCP router | Custom (arena-pc-control) | Proprietary (this repo) | **Custom** — needed crash recovery + multi-server namespacing |
| Local WebSocket bridge with auth | Custom (arena-pc-control) | Proprietary | **Custom** — ZeroScript had no auth/Origin check; rebuilt secure |
| MV3 Extension for arena.ai | Custom (arena-pc-control) | Proprietary | **Custom** — non-destructive dock + Approve/Deny UI |
| JARVIS orchestration layer | Custom (arena-pc-control) | Proprietary | **Custom** — intent, planning, verification, recovery, memory, self-improvement |

---

## 5. Phased Implementation & Verification Roadmap

| Phase | Scope | Status |
|---|---|---|
| **Phase 1 — Secure Core Bridge** | Loopback WS, Origin check, 256-bit token, PolicyEngine, JSONL audit, MCP router with crash recovery | ✅ Implemented & tested (9 tests) |
| **Phase 2 — Built-in PC Tools & Extension** | 22-tool builtin server, MV3 extension with dock + approval UI, protocol parser | ✅ Implemented & tested (5 tests) |
| **Phase 3 — JARVIS Intelligence Layer** | Intent analyzer, task planner, task engine with verification/recovery, extended memory, self-improvement, emergency stop | ✅ Implemented & tested (35 tests) |
| **Phase 4 — Live Windows Validation** | Run `start_windows.bat` + `scripts/windows_selftest.py` on physical Windows 10/11 to verify UIA, input, and screen capture | ⏳ Requires your Windows machine |
| **Phase 5 — Playwright MCP Live** | Enable `"playwright": true` in `config.local.json`, verify YouTube/browser automation on Windows | ⏳ Requires Node.js 20+ on Windows |

**Total automated tests: 44 Python tests passing + 5 Node.js extension tests passing.**

---

## 6. What Still Needs Your Windows Machine

Because this sandbox runs Linux, the following Windows-specific capabilities are **implemented in code but not yet executed live**:

- `app_list_windows`, `app_launch`, `app_focus_window` (PowerShell + Win32)
- `ui_inspect_window` (PowerShell UIAutomationClient)
- `screen_capture` (Pillow ImageGrab)
- `input_mouse` with `(0,0)` fail-safe (Win32 mouse_event)
- `input_keyboard` (WScript.Shell SendKeys)

Please run `scripts/windows_selftest.py` on your Windows PC to validate these before full autonomous use.
