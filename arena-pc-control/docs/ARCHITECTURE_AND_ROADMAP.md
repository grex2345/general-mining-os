# Arena PC Control — Architecture & Roadmap (Infrastructure-Only Edition)

## 1. Executive Summary

Arena PC Control provides **local execution infrastructure** for AI Agents running inside Arena.ai.

**Core principle: The Arena AI Agent is the brain.** It already has intelligence, reasoning, planning, context, and conversation capabilities. This system provides only the eyes, hands, tools, and connection to Windows — nothing more.

**No additional AI API is required.** No OpenAI, Anthropic, Gemini, Ollama, or separate chatbot. The existing Arena Agent uses the PC-control system through the Chrome/Edge extension and local Bridge.

---

## 2. Target Architecture

```
USER
  ↓
EXISTING AI AGENT INSIDE Arena.ai
  (Existing intelligence, reasoning, planning, conversation)
  ↓
UNIVERSAL AGENT CONNECTOR
  (Provider adapters — detects supported Arena agent interfaces)
  ↓
CHROME / EDGE EXTENSION (Manifest V3)
  (Non-destructive dock, Approve/Deny UI, tool-call routing, screenshot staging)
  ↓
LOCAL AUTHENTICATED BRIDGE (ws://127.0.0.1:18765)
  (localhost only, 256-bit pairing token, Origin allowlist, session management)
  ↓
PC CONTROL ENGINE + MCP ROUTER
  (PolicyEngine ALLOW/CONFIRM/DENY, session isolation, resource locking, audit log)
  ↓
WINDOWS PC
  (Files, apps, browser, mouse/keyboard, screenshots, CMD/PowerShell)
```

### Data Flow (Agent-controlled task)

1. User gives objective to Arena AI Agent
2. Arena Agent decides which PC tool to use
3. Extension delivers tool-call instruction to Arena Agent's conversation
4. Agent sends tool call via extension → Bridge (authenticated WebSocket)
5. Bridge validates policy (ALLOW/CONFIRM/DENY) and session isolation
6. If CONFIRM: Approve/Deny modal shown to user in Arena
7. MCP Router routes tool call to appropriate server (local_pc, optional Playwright MCP, optional Windows-MCP)
8. Windows executes the action
9. Result (text, error, or screenshot image) returns via Bridge → Extension → Arena Agent
10. Arena Agent analyzes result, decides next action, repeats until complete

---

## 3. Components

| Component | File(s) | Role |
|---|---|---|
| Local Bridge | `bridge/server.py` | Authenticated WebSocket server, localhost-only, session management, policy enforcement, audit logging |
| Session Manager | `bridge/session_manager.py` | Multi-agent session isolation, correlation IDs, resource locking |
| Policy Engine | `bridge/policy.py` | ALLOW/CONFIRM/DENY security tiers, credential path blocking, shell command filtering |
| MCP Router | `bridge/mcp_client.py` | Multi-server stdio MCP router with crash recovery and auto-restart |
| Built-in PC Server | `bridge/builtin_mcp_server.py` | 22 MCP tools: filesystem, shell, web, memory, Windows desktop control |
| Chrome/Edge Extension | `extension/` | Manifest V3 extension, non-destructive dock, Approve/Deny UI, provider adapters |
| Protocol Parser | `extension/protocol.js` | `@@@ARENA_PC@@@` fenced protocol parsing, streaming detection, self-correction |
| Base Adapter | `extension/providers/base_adapter.js` | Abstract provider adapter interface |
| Arena Direct Adapter | `extension/providers/arena_direct.js` | Adapter for Arena.ai Direct mode chat interface |
| Background Service Worker | `extension/background.js` | WebSocket connection management, adapter registry, tab-level adapter tracking |
| Content Adapter | `extension/arena_adapter.js` | Universal adapter detection, auto-activation, session-aware tool routing |
| Orchestrator | `jarvis_core/orchestrator.py` | Bridge coordination, session lifecycle, resource locking, tool routing |
| Memory | `jarvis_core/memory_extended.py` | Persistent SQLite memory for session context, project history, preferences |
| Self-Improvement | `jarvis_core/self_improvement.py` | Failure analysis, fix suggestions, workflow reuse |
| Emergency Stop | `jarvis_core/emergency_stop.py` | Persisted kill switch, halts all execution |
| Unified Launcher | `scripts/start.bat` | Single script to start Bridge and verify startup |

---

## 4. Security Boundaries

| Boundary | Implementation |
|---|---|
| No public exposure | Bridge binds to `127.0.0.1` only; `0.0.0.0` rejected at startup |
| Origin hijacking | WebSocket `origins` allowlist: `chrome-extension://`, `moz-extension://`, local CLI only |
| Authentication | 256-bit `secrets.token_urlsafe(32)` pairing token, `hmac.compare_digest` |
| Privilege escalation | `refuseAdminStartup` — bridge refuses to run as Windows Administrator |
| Destructive operations | PolicyEngine CONFIRM tier; human approval modal in Arena extension |
| Credential theft | Hard DENY for `.ssh`, browser cookies, `.ROBLOSECURITY`, system dirs |
| Audit trail | JSONL `audit.jsonl` — every auth, approval, tool execution, denial, and emergency stop |
| Emergency stop | Global kill switch halts all autonomous execution; survives restarts |
| Session isolation | Unique session IDs per agent; correlated tool requests/responses; no cross-session data leakage |
| Resource locking | Prevents conflicting mouse/keyboard/app operations across concurrent agents |

---

## 5. Reusable OSS Components vs Custom Builds

| Component | Source | License | Decision |
|---|---|---|---|
| Browser automation (Accessibility Tree) | `microsoft/playwright-mcp` | Apache-2.0 | **Optional reuse** — mount via `npx @playwright/mcp@latest` in `config.local.json` |
| Windows UI Automation MCP | `CursorTouch/Windows-MCP` | MIT | **Optional reuse** — `uvx windows-mcp`; built-in Python 3.10+ UIA tools also available |
| JSON-RPC 2.0 stdio MCP router | Custom (arena-pc-control) | Proprietary | **Custom** — needed crash recovery + multi-server namespacing |
| Local WebSocket bridge with auth | Custom (arena-pc-control) | Proprietary | **Custom** — secure replacement for unauthenticated bridges |
| MV3 Extension for Arena.ai | Custom (arena-pc-control) | Proprietary | **Custom** — non-destructive dock + Approve/Deny UI |
| Session isolation & resource locking | Custom (arena-pc-control) | Proprietary | **Custom** — multi-agent safety |
| ZeroScript-Free v1.9.2 | `sebattfg/ZeroScript-Free` | GPL-3.0 | **Architectural reference only** — concepts studied, code not copied (GPL-incompatible) |

---

## 6. Supported Arena Agent Interfaces

### Currently Supported (Tested)

| Interface | Adapter | Detection Method | Status |
|---|---|---|---|
| Arena.ai Direct Mode | `arena_direct` | `ol.flex-col-reverse` + `.prose` + form textarea + Send button | ✅ Implemented, unit-tested |

### Not Yet Supported (Documented Limitation)

- Other Arena agent interfaces/modes beyond Direct mode have **not** been tested.
- Direct tool calling via Arena's native agent/tool API (if it exists) has **not** been investigated.
- The extension currently uses DOM-based integration (textarea injection + Send button click) for Arena Direct mode. If Arena provides a more reliable supported mechanism (official agent tool interface), the adapter should be updated to use it.

### Honesty Statement

**Only Arena.ai Direct Mode has been implemented and unit-tested.** Other Arena agent interfaces are not supported. Do not assume universal compatibility without evidence.

---

## 7. Phased Implementation & Verification Roadmap

| Phase | Scope | Status |
|---|---|---|
| **Phase 1 — Secure Core Bridge** | Loopback WS, Origin check, 256-bit token, PolicyEngine, JSONL audit, MCP router with crash recovery | ✅ Implemented & tested (9 tests) |
| **Phase 2 — Built-in PC Tools & Extension** | 22-tool builtin server, MV3 extension with dock + approval UI, protocol parser | ✅ Implemented & tested (5 Node.js tests) |
| **Phase 3 — Session Isolation & Resource Locking** | Multi-agent sessions, correlation IDs, resource locking, emergency stop | ✅ Implemented & tested |
| **Phase 4 — Live Windows Validation** | Run `start.bat` + `scripts/windows_selftest.py` on physical Windows 10/11 | ⏳ Requires your Windows machine |
| **Phase 5 — Arena Integration Testing** | Verify Arena Agent can issue PC tool calls via extension on real Windows | ⏳ Requires Arena.ai access + supported agent |

**Total automated tests: 66 Python tests passing + 11 Node.js tests passing.**

---

## 8. What Still Needs Your Windows Machine

Because this development environment runs Linux, the following Windows-specific capabilities are **implemented in code but not yet executed live**:

- `app_list_windows`, `app_launch`, `app_focus_window` (PowerShell + Win32)
- `ui_inspect_window` (PowerShell UIAutomationClient)
- `screen_capture` (Pillow ImageGrab)
- `input_mouse` with `(0,0)` fail-safe (Win32 mouse_event)
- `input_keyboard` (WScript.Shell SendKeys)

Please run `scripts/windows_selftest.py` on your Windows PC to validate these before full autonomous use.

---

## 9. Known Limitations

1. **Arena Direct Mode only** — Only the Arena.ai Direct mode chat interface has been implemented as a provider adapter. Other Arena agent interfaces are not supported.
2. **DOM-based integration** — The extension uses textarea injection and Send button clicking. If Arena changes its DOM structure or provides a native tool-calling API, the adapter needs updating.
3. **Windows GUI tools untested live** — All Windows desktop control tools are implemented but require a real Windows machine for validation.
4. **No native Arena tool API** — The system does not use any official Arena agent tool-calling API (none has been confirmed to exist). Integration is via the extension's DOM manipulation.
5. **Playwright MCP optional** — Browser automation via `@playwright/mcp` is optional and requires Node.js 20+ installation.
