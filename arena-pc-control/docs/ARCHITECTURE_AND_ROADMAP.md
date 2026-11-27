# Arena PC Control — Technical Investigation, Architecture & Roadmap

## 1. Deep Analysis of `ZeroScript-Free` (What Works & Where It Falls Short for Full PC Control)

We inspected `sebattfg/ZeroScript-Free` at the source-code level (`bridge.py`, `launch_studio_mcp.py`, `zeroscript-extension/background.js`, `core/parser.js`, `core/config.js`, and `providers/arena.js`):

| Layer | How ZeroScript Works | Strengths Worth Adapting | Critical Gaps for Full Windows PC Control |
|---|---|---|---|
| **Browser Extension (`Manifest V3`)** | Content script injects a system prompt into web chat DOM (`arena.ai`, `chat.deepseek.com`, etc.), parses tool calls from model replies, and talks to `background.js` over `chrome.runtime.sendMessage`. | Placing the WebSocket inside the MV3 Service Worker (`background.js`) cleanly avoids HTTPS-to-`ws://127.0.0.1` Mixed Content blocks and survives minor DOM re-renders. | Hardcoded around Roblox Studio categories, `###LUA###` blocks, and Direct-only assumptions; no UI for approving sensitive actions. |
| **Local Bridge (`bridge.py`)** | Listens on `ws://127.0.0.1:17613` and spawns `stdio` MCP child servers (`launch_studio_mcp.py`) with 1 reader thread per server, `queue.Queue` JSON-RPC ID matching, and auto-restart on child crash. | Per-server thread isolation, stderr ring-buffer draining, and automatic child process recovery prevent silent agent deadlocks. | **Unauthenticated WebSocket & no Origin check**: any webpage or local script connecting to `127.0.0.1:17613` can execute tools. Fatal for shell/file/desktop control. |
| **Permission & Security Model** | Prompt-only instruction (`"NEVER DELETE BROADLY"`). | Good prompt hygiene reduces accidental model mistakes. | **Zero runtime enforcement**: indirect prompt injection (e.g., from a YouTube comment or webpage) could run arbitrary commands or read browser cookies. |
| **Session & Persistent Memory** | Saves markdown notes inside a Roblox `ModuleScript` (`game.ServerStorage.ZeroScript.Memory`). | Selective recall + explicit rule never to store unverified guesses as permanent facts. | Coupled to a `.rbxl` Roblox place file; cannot store cross-application or multi-project PC context. |

---

## 2. Open-Source Ecosystem Survey (Reuse vs. Custom Build)

Before writing code, we audited leading open-source repositories for Windows & browser computer use:

1. **`microsoft/playwright-mcp` (40k+ stars, Apache-2.0)**
   - Exposes Playwright browser control (`browser_navigate`, `browser_snapshot`, `browser_click`, `browser_type`, `browser_tabs`) via structured **Accessibility Snapshots** instead of pixel-guessing.
   - **Decision**: **Reuse directly as a first-class MCP server** in `config.default.json` (`npx @playwright/mcp@latest`), complemented by lightweight built-in `open_url` and `web_fetch_readable` tools when Node/Playwright isn't running.
2. **`CursorTouch/Windows-MCP` (12k+ stars, MIT)**
   - Uses the Windows UI Automation (UIA) Accessibility Tree + synthetic input (`State-Tool`, `Click-Tool`, `App-Tool`, `Powershell-Tool`).
   - *Constraint*: Latest PyPI builds require Python 3.14+.
   - **Decision**: **Support plugging `uvx windows-mcp` directly into `MCPRouter`**, AND build native Python 3.10+ Windows 10/11 tools (`app_list_windows`, `app_launch`, `app_focus_window`, `ui_inspect_window` via `.NET System.Windows.Automation`, `input_mouse`, `input_keyboard`, `screen_capture`) in `builtin_mcp_server.py` so the system works out-of-the-box on standard Python 3.10–3.13 installations without admin privileges.
3. **Pure Pixel/Vision Agents (`PyAutoGUI` / `computer-use-demo`)**
   - Slow (2–6s per screenshot roundtrip), brittle when windows move, and expensive in context tokens.
   - **Decision**: Use **Accessibility Tree first** (Playwright DOM snapshot for web, Windows UIA for desktop apps) and reserve **`screen_capture` + coordinate input** as a visual verification and fallback layer.

---

## 3. Architecture Comparison & Chosen Design

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ Browser (https://arena.ai)                                              │
│  ┌──────────────────────────────┐     ┌───────────────────────────────┐ │
│  │ arena_adapter.js + UI Dock   │◄───►│ MV3 Service Worker            │ │
│  │ • Extracts @@@ARENA_PC@@@    │     │ (background.js)               │ │
│  │ • Renders Approve/Deny Modal │     │ • Authenticated WS Client     │ │
│  └──────────────────────────────┘     └──────────────┬────────────────┘ │
└──────────────────────────────────────────────────────┼──────────────────┘
                                                       │ ws://127.0.0.1:18765
                                                       │ Origin Check + 256-bit Token
┌──────────────────────────────────────────────────────▼──────────────────┐
│ User's Windows 10/11 PC (Standard Non-Admin User Process)               │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ BridgeServer (bridge/server.py)                                    │ │
│  │  1. Origin Allowlist (chrome-extension:// only; blocks websites)   │ │
│  │  2. HMAC Token Auth (~/.arena-pc-control/auth_token.txt)           │ │
│  │  3. PolicyEngine (ALLOW / CONFIRM / DENY + Audit Log JSONL)        │ │
│  │  4. MCPRouter (JSON-RPC 2.0 over stdio, auto-restart, namespacing) │ │
│  └───────────┬──────────────────────────────┬─────────────────────────┘ │
│              │                              │                           │
│  ┌───────────▼───────────────┐  ┌───────────▼─────────────────────────┐ │
│  │ BuiltinPCServer           │  │ External Stdio MCP Servers          │ │
│  │ • fs_* (atomic + guarded) │  │ • @playwright/mcp (YouTube, Web UI) │ │
│  │ • shell_exec (PowerShell) │  │ • uvx windows-mcp (optional addon)  │ │
│  │ • Windows UIA + Win32 I/O │  │ • Any custom MCP server             │ │
│  │ • SQLite MemoryStore      │  └─────────────────────────────────────┘ │
│  └───────────────────────────┘                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Phased Implementation & Verification Roadmap

| Phase | Scope | Verification Status |
|---|---|---|
| **Phase 1 — Secure Core Bridge, Policy Gate & Persistent Memory** | Loopback WS server, Origin & 256-bit token auth, `PolicyEngine` (`ALLOW`/`CONFIRM`/`DENY`), JSONL audit log, SQLite `MemoryStore`, `MCPRouter` with crash recovery. | **Implemented & Verified** (`pytest` E2E tests passing in Linux CI). |
| **Phase 2 — Built-in File, Supervised Shell, Readable Web & Protocol Parser** | Atomic `fs_*` tools with recovery hints, non-elevated `shell_exec`, `web_fetch_readable`, `open_url`, MV3 `extension/` with `protocol.js` & interactive approval UI. | **Implemented & Verified** (`pytest` + `node --test` passing). |
| **Phase 3 — Windows 10/11 Native Desktop UIA, Input & Playwright MCP Live Validation** | `app_list_windows`, `app_launch`, `app_focus_window`, `ui_inspect_window`, `input_mouse` (with `(0,0)` corner fail-safe), `input_keyboard`, `screen_capture`, and `@playwright/mcp` browser sessions on physical Windows 10/11. | **Implemented in code**; requires execution of `start_windows.bat` + `python scripts/windows_selftest.py` on your physical Windows PC to verify live Win32/UIA GUI hooks. |
