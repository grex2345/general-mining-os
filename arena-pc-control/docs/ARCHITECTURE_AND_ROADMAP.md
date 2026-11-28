# Arena PC Control — Architecture, Verification Report & Deliverable

## 📋 executive Summary

Arena PC Control provides **local execution infrastructure** for AI Agents running inside Arena.ai.

**Core principle (non-negotiable): The Arena AI Agent is the ONLY AI brain.** It already has intelligence, reasoning, planning, context, and conversation capabilities. This system provides only the eyes, hands, tools, and connection to Windows — nothing more.

**No additional AI API is required.** No OpenAI, Anthropic, Gemini, Ollama, DeepSeek, or separate chatbot. The existing Arena Agent uses the PC-control system through the Chrome/Edge extension and local Bridge.

---

## 🏗️ Final Architecture

```
USER
  ↓
EXISTING AI AGENT INSIDE Arena.ai
  (Existing intelligence, reasoning, planning, conversation — THE ONLY BRAIN)
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
2. Arena Agent decides which PC tool to use (its own reasoning)
3. Extension delivers tool-call instruction to Arena Agent's conversation
4. Agent sends tool call via extension → Bridge (authenticated WebSocket)
5. Bridge validates policy (ALLOW/CONFIRM/DENY) and session isolation
6. If CONFIRM: Approve/Deny modal shown to user in Arena
7. MCP Router routes tool call to appropriate server (local_pc, optional Playwright MCP, optional Windows-MCP)
8. Windows executes the action
9. Result (text, error, or screenshot image) returns via Bridge → Extension → Arena Agent
10. Arena Agent analyzes result, decides next action, repeats until complete

---

## 🔬 GitHub Research Findings

The following open-source projects were examined to inform architecture decisions:

### Windows Desktop Automation

| Project | License | Stars | Key Findings | Decision |
|---|---|---|---|---|
| `CursorTouch/Windows-MCP` | MIT | ~12,000 | Lightweight Python MCP server for Windows 10/11 via UI Automation. Tools: file navigation, app control, UI interaction, QA testing. Latency 0.2–0.5s. Available via `uvx windows-mcp`. | **Optional reuse** — can be mounted as external MCP server alongside `local_pc`. Requires Python 3.14+ for latest builds. |
| `shanselman/FlaUI-MCP` | MIT | ~300 forks | .NET MCP server using FlaUI + UI Automation. Playwright-inspired snapshot/ref pattern: `windows_snapshot` → `windows_click ref="..."`. No coordinate guessing. Works with Win32, WPF, WinForms, UWP. | **Architectural inspiration** — snapshot/ref model adopted for UI element references. |
| `martins-vds/desktop-computer-use-mcp-server` | MIT/Apache-2.0 | — | .NET 8 MCP server using FlaUI with UIA2/UIA3 backends. Allowlisted app profiles, serialized UIA on MTA thread, bounded inspection, post-action observation, sensitive-value redaction, audit logging. | **Architectural inspiration** — safety gates, allowlisting, and audit logging patterns. |
| `pm-jd/WindowsMCP.NET` | MIT | — | .NET MCP server with Streamable HTTP transport, portable single-file exe, 21 tools for full desktop control (Input, Screen, Apps, System, Data, UI). | **Not adopted** — HTTP transport adds complexity; stdio MCP is sufficient for local bridge. |
| `pywinauto/pywinauto` | BSD-3-Clause | — | Python library for Windows GUI automation. Two backends: win32 (Win32 API) and uia (Microsoft UI Automation). "Best match" search algorithm. | **Not adopted as dependency** — built-in PowerShell UIA tools avoid adding heavy dependency. Concepts reused. |

### Browser Automation & Local Bridges

| Project | License | Key Findings | Decision |
|---|---|---|---|
| `microsoft/playwright-mcp` | Apache-2.0 | Official Microsoft Playwright MCP server. Browser automation via structured accessibility snapshots. Tools: `browser_navigate`, `browser_click`, `browser_type`, `browser_snapshot`. | **Optional reuse** — mount via `npx @playwright/mcp@latest` in `config.local.json`. |
| `pi-control-chrome` | — | Chrome/Edge MV3 extension + local WebSocket bridge. Loopback binding, pairing token, heartbeats to prevent idle suspension. | **Architectural inspiration** — loopback binding + pairing token pattern. |
| `Claude Code Bridge Extension` | — | MV3 extension, WebSocket client, content script injection, `chrome.tabs` API, `chrome.scripting` for JS execution, 15s heartbeat/auto-reconnect. | **Architectural inspiration** — heartbeat + auto-reconnect pattern. |
| `InBrowserMcp` | MIT | Experimental MCP server driving Chrome extension over WebSocket. TypeScript Streamable HTTP + Manifest V3 extension. | **Not adopted** — HTTP transport adds complexity for local use. |
| `legisus/ai-bridge` | MIT | Chrome debugger protocol (CDP) for browser control. `chrome.debugger` + DevTools Protocol per tab. Trusted input, CSP-proof eval. | **Not adopted** — CDP is browser-specific; DOM-based approach is more general for Arena integration. |

### Communication & Integration Patterns

| Pattern | Source | Decision |
|---|---|---|
| Local WebSocket bridge with token auth | `pi-control-chrome`, `Claude Code Bridge` | **Adopted** — `ws://127.0.0.1:18765` with 256-bit pairing token. |
| Origin allowlist | Custom (ZeroScript had none) | **Adopted** — `chrome-extension://`, `moz-extension://`, local CLI only. |
| Fenced protocol parser (`@@@ARENA_PC@@@`) | Custom (inspired by ZeroScript parser) | **Adopted** — streaming detection, correction/observation formatters. |
| Human-in-the-Loop approval modal | Custom | **Adopted** — Approve/Deny card in Arena for CONFIRM-tier actions. |
| Session isolation + resource locking | Custom | **Adopted** — unique session IDs, correlation IDs, resource locks. |
| Crash recovery / auto-restart MCP | Custom (inspired by ZeroScript bridge.py) | **Adopted** — MCPStdioClient restarts on child process death. |

### ZeroScript-Free v1.9.2 Investigation

**MediaFire link:** `https://www.mediafire.com/file/m617m1qaxgclv8u/ZeroScript-Free-v1.9.2.zip/file`

**Status:** ❌ **Cannot access MediaFire.** This host is not in the allowed network access list. The file could not be downloaded or inspected.

**Alternative:** The source code of `sebattfg/ZeroScript-Free` was previously inspected from GitHub (clone at `/tmp/zeroscript-study`, since deleted). Key architectural findings:

| Finding | ZeroScript | Our Fix |
|---|---|---|
| WebSocket auth | None — `ws://127.0.0.1:17613` open to any local process | 256-bit token + `hmac.compare_digest` |
| Origin check | None — any origin accepted | Strict `Origin` allowlist (extensions + local CLI only) |
| Privilege | No admin check | `refuseAdminStartup` — refuses to run as Administrator |
| Policy enforcement | Prompt-only (`"NEVER DELETE BROADLY"`) | Code-enforced `PolicyEngine` (ALLOW/CONFIRM/DENY) |
| Memory | Roblox `ModuleScript` | Local SQLite WAL database (`~/.arena-pc-control/memory.db`) |
| License | GPL-3.0 | **Not copied** — architectural concepts only, custom implementation |

**License compliance:** ZeroScript-Free is GPL-3.0. No code was copied from it. Only architectural concepts (bridge pattern, fenced protocol, MCP router, per-server threads) were studied and reimplemented independently under this project's own license.

---

## 🔧 Components

| Component | File(s) | Role | Status |
|---|---|---|---|
| Local Bridge | `bridge/server.py` | Authenticated WebSocket server, localhost-only, session management, policy enforcement, audit logging | ✅ Implemented & tested |
| Session Manager | `bridge/session_manager.py` | Multi-agent session isolation, correlation IDs, resource locking | ✅ Implemented & tested |
| Policy Engine | `bridge/policy.py` | ALLOW/CONFIRM/DENY security tiers, credential path blocking, shell command filtering | ✅ Implemented & tested |
| MCP Router | `bridge/mcp_client.py` | Multi-server stdio MCP router with crash recovery and auto-restart | ✅ Implemented & tested |
| Built-in PC Server | `bridge/builtin_mcp_server.py` | 22 MCP tools: filesystem, shell, web, memory, Windows desktop control | ✅ Implemented (Windows GUI untested on Linux) |
| Chrome/Edge Extension | `extension/` | Manifest V3 extension, non-destructive dock, Approve/Deny UI, provider adapters | ✅ Implemented & tested (jsdom + real bridge) |
| Protocol Parser | `extension/protocol.js` | `@@@ARENA_PC@@@` fenced protocol parsing, streaming detection, self-correction | ✅ Implemented & tested |
| Base Adapter | `extension/providers/base_adapter.js` | Abstract provider adapter interface | ✅ Implemented & tested |
| Arena Direct Adapter | `extension/providers/arena_direct.js` | Adapter for Arena.ai Direct mode chat interface | ✅ Implemented & tested |
| Background Service Worker | `extension/background.js` | WebSocket connection management, adapter registry, tab-level adapter tracking | ✅ Implemented & tested |
| Content Adapter | `extension/arena_adapter.js` | Universal adapter detection, auto-activation, session-aware tool routing | ✅ Implemented & tested |
| Orchestrator | `jarvis_core/orchestrator.py` | Bridge coordination, session lifecycle, resource locking, tool routing | ✅ Implemented & tested |
| Memory | `jarvis_core/memory_extended.py` | Persistent SQLite memory for session context, project history, preferences | ✅ Implemented & tested |
| Self-Improvement | `jarvis_core/self_improvement.py` | Failure analysis, fix suggestions, workflow reuse | ✅ Implemented & tested |
| Emergency Stop | `jarvis_core/emergency_stop.py` | Persisted kill switch, halts all execution | ✅ Implemented & tested |
| Unified Launcher | `launcher.py` (called by every `.bat`) | One implementation: admin refusal, venv+deps, venv handoff, port, token, bridge, 4-stage verification, readable failures | ✅ Implemented & tested |

---

## 🔐 Security Boundaries

| Boundary | Implementation |
|---|---|
| No public exposure | Bridge binds to `127.0.0.1` only; `0.0.0.0` rejected at startup |
| Origin hijacking | WebSocket `origins` allowlist: `chrome-extension://`, `moz-extension://`, local CLI only |
| Authentication | 256-bit `secrets.token_urlsafe(32)` pairing token, `hmac.compare_digest` |
| Privilege escalation | `refuseAdminStartup` — bridge refuses to run as Windows Administrator |
| Destructive operations | PolicyEngine CONFIRM tier; human approval modal in Arena extension |
| Credential theft | Hard DENY for `.ssh`, browser cookies, `.ROBLOSECURITY`, system dirs |
| Audit trail | JSONL `audit.jsonl` — every auth, approval, tool execution, denial, emergency stop |
| Emergency stop | Global kill switch halts all execution; survives restarts via `emergency_stop.json` |
| Session isolation | Unique session ID per tab; the bridge binds every call to its owning socket + session; approvals only reach the requesting tab; idle sessions reaped |
| Resource locking | Prevents conflicting mouse/keyboard/app operations across concurrent agents |
| Least privilege | Non-admin user process; no `RunAs`, no `sudo`, no Defender/UAC tampering |

---

## 🎯 Supported Arena Agent Interfaces

### Currently Supported (Implemented & Unit-Tested)

| Interface | Adapter | Detection Method | Status |
|---|---|---|---|
| Arena.ai Direct Mode | `arena_direct` | `ol.flex-col-reverse` + `.prose` + form textarea + Send button | ✅ Implemented, unit-tested (Node.js) |

### Not Yet Supported (Documented Limitation)

- **Other Arena agent interfaces/modes** beyond Direct mode have not been tested or implemented.
- **Direct tool calling via Arena's native agent/tool API** (if it exists) has not been investigated or confirmed.
- **DOM-based integration** is the current mechanism (textarea injection + Send button click). If Arena provides a more reliable supported mechanism (official agent tool interface), the adapter should be updated to use it.

### Honesty Statement

**Only Arena.ai Direct Mode has been implemented and unit-tested.** Other Arena agent interfaces are not supported. Do not assume universal compatibility without evidence. DOM manipulation is used as the integration mechanism; this is transparently documented as a limitation.

---

## 🪟 Windows Control Engine — Implemented Tools

The built-in MCP server (`bridge/builtin_mcp_server.py`) exposes 22 tools:

| Category | Tools | Windows Implementation |
|---|---|---|
| System | `system_info` | `platform` module + `ctypes` for screen metrics |
| Filesystem | `fs_list`, `fs_read`, `fs_write`, `fs_edit`, `fs_move`, `fs_mkdir`, `fs_delete` | `pathlib` + `shutil` + atomic write (tmp + `os.replace`) |
| Shell | `shell_exec` | `powershell.exe -NoProfile -NonInteractive -Command` (non-elevated) |
| Web | `open_url`, `web_fetch_readable` | `webbrowser.open` + `urllib.request` with HTML parsing |
| Memory | `memory_save`, `memory_recall`, `memory_list_projects`, `memory_delete` | SQLite WAL database |
| Desktop (Windows only) | `app_list_windows`, `app_launch`, `app_focus_window`, `ui_inspect_window` | PowerShell + Win32 API + UIAutomationClient |
| Input (Windows only) | `input_mouse`, `input_keyboard` | `ctypes.windll.user32` (mouse_event) + WScript.Shell SendKeys |
| Visual (Windows only) | `screen_capture` | Pillow `ImageGrab` with JPEG compression |

**Windows-only tools require a real Windows machine for validation.** They return a clear error on non-Windows OS.

---

## 🧪 Verification (what actually runs)

One command covers the whole chain:

```bash
python -m pytest -q
```

| Suite | What it proves |
|---|---|
| `tests/test_policy*.py` | ALLOW/CONFIRM/DENY tiers, SSRF/loopback/metadata blocking, RCE recipes (`curl … \| sh`), system-dir reads, workspace writes |
| `tests/test_bridge_e2e.py` | Origin allowlist, token auth, human approval (deny + approve), audit log |
| `tests/test_bridge_multi_session.py` | session create/list/close, isolation, resource locking |
| `tests/test_bridge_regressions.py` | two tabs on one socket stay isolated · closing a session keeps the rest · abrupt disconnect · single-instance lock · clean port-in-use error · idle session reaper |
| `tests/test_mcp_and_tools.py` | real stdio MCP: filesystem, shell, web fetch, memory, crash recovery, multi-server namespacing |
| `tests/test_mcp_client_regressions.py` | protocol-version handshake with modern servers, noisy stdout framing, image content, exit diagnostics |
| `tests/test_jarvis_*.py`, `test_memory.py` | orchestrator, extended memory, self-improvement, emergency stop |
| `tests/test_startup_scripts.py` | launcher verification chain, no top-level `await` in content scripts, manifest order, no removed chrome APIs |
| `tests/test_extension_live.py` | **runs `tests/test_extension_e2e.py`**: the real extension sources in jsdom against a real Bridge (14 scenarios, see below) |

### Extension end-to-end scenarios (`tests/test_extension_e2e.mjs`)

1. manifest only ships valid **classic** content scripts (no top-level `await`)
2. no removed / unpermitted `chrome.*` APIs
3. background worker authenticates and lists the MCP catalog
4. dock renders and reports paired status
5. full loop: agent tool block → real filesystem write → observation returned
6. CONFIRM-tier tool: deny runs nothing, approve executes and returns stdout
7. malformed agent JSON → self-correction prompt, session stays alive
8. plain final answers never generate outbound messages
9. half-streamed tool blocks are not executed until closed
10. "Stop PC Session" halts the loop
11. reconnect after the bridge restarts
12. two Arena tabs: sessions isolated, approvals routed only to the owning tab
13. contenteditable composer: prompts still reach the agent when there is no `<textarea>`
14. two simultaneous approval requests queue (no card is overwritten) and each shows a live countdown
15. popup pairs with the live bridge ("Paired & Ready")
16. popup surfaces a wrong token instead of claiming readiness

### Operational tooling

| Command | Purpose |
|---|---|
| `start_windows.bat` | ASCII/CRLF stub that finds Python and runs `launcher.py start` (all logic is Python) |
| `scripts/stop.bat` | Stop the bridge from its pid file and free the port |
| `kill.bat` | Emergency stop: halts every tool call immediately (bridge stays up but blocked) |
| `scripts/doctor.py --deep` (`scripts/doctor.bat`) | 20-point diagnosis of config, deps, extension files, token, process, port, handshake and MCP tools — prints the exact fix for each failure |
| `launcher.py {start,stop,status,doctor,selftest,kill}` | The single startup implementation (also callable directly with any Python) |
| `scripts/bootstrap.py {token,launch,wait,stop,selfcheck,status}` | Small helper primitives used by tests and tooling (delegates to `launcher.py`) |
| `scripts/verify_bridge.py --port N` | TCP → WebSocket → auth → `list_tools` verification used by the launcher |
| `scripts/windows_selftest.py [--json]` | Live capability test of the 22 MCP tools on the target machine |
| `scripts/emergency_stop.py --activate/--reset` | Global kill switch |

### Windows-only (needs a real machine)

`python scripts/windows_selftest.py` drives the 22 MCP tools through the real
stdio server and reports PASS/FAIL/SKIP per capability:

`app_list_windows`, `app_launch`, `app_focus_window`, `ui_inspect_window`,
`screen_capture`, `input_mouse`, `input_keyboard` — all implemented; the script
also re-checks that a launched app actually created a window.

---

## 🐞 Defects found & fixed in this repair

| # | Defect | Impact | Fix |
|---|---|---|---|
| 1 | `arena_adapter.js` used top-level `await import()` in a **classic** content script | `SyntaxError` → the whole extension was inert; nothing worked at all | Providers are UMD files injected by the manifest (`ArenaPCProviders`), adapter stays classic-safe |
| 2 | `background.js` auth frame omitted the `token` field | Bridge rejected every pairing attempt ("Invalid pairing token") | `token` is sent; auth errors surface in the dock/popup |
| 3 | `sendFrame()` could resolve before the pending request was registered | First request on a fresh socket (the auth) never matched its reply | The serialized writer only sends when the waiter still exists |
| 4 | `chrome.tabs.sendMessage(...).catch()` used promise style without `"tabs"` permission | TypeErrors / no message delivery | `tabs` permission declared; send failures handled explicitly |
| 5 | Approvals could be sent to the wrong/other tab; message-type mismatch (`approvalId` vs `approval.id`) | Approve/Deny never worked, or leaked across tabs | Per-tab session map, exact payload contract, bridge-side owner check |
| 6 | `create_session` replies raced ahead of the tab↔session mapping | CONFIRM-tier call right after session start had no owner | Mapping is written before the caller is unblocked |
| 7 | One socket serving two Arena tabs used the *last created* session | Tool results attributed to the wrong tab, cross-tab approvals | Bridge binds calls to the named session and verifies socket ownership |
| 8 | `close_session` detached the socket and closed its other sessions | Closing one tab killed the other tab's session | Only the named session is removed |
| 9 | `fs_write`/`fs_edit` on the same temp name + `os.replace` | Windows `PermissionError` under antivirus/indexer | Unique temp name with `O_EXCL`, retrying replace |
| 10 | Web tools allowed `127.0.0.1`, RFC1918 and cloud-metadata URLs | Agent could reach the bridge, local admin panels, cloud credentials | Loopback/private → CONFIRM, metadata → DENY, non-http → DENY |
| 11 | Shell filter missed `curl … \| sh`, `iwr … \| iex`, `certutil -urlcache` | Remote code execution with a plausible-looking command | Explicit dangerous-combination denylist |
| 12 | Reads inside `C:\Windows` / `/etc` were silently ALLOWed | System config disclosure | CONFIRM for system directories (writes stay DENY) |
| 13 | MCP handshake advertised only `2024-11-05` | Playwright MCP / Windows-MCP rejected `initialize` | Offer `2025-06-18` → `2025-03-26` → `2024-11-05`, record negotiated version |
| 14 | Non-JSON lines on a server's stdout were dropped silently | Framing bugs invisible; some servers unframed | Noise tolerated and logged; exit codes recorded for the health monitor |
| 15 | `start.bat` launched the bridge **without `--config`**, printed the token before it existed, never refused admin | Wrong port/policy, empty token, insecure runs | Single verified launcher: refuse admin → venv → free port → token → bridge → 4-stage verify |
| 16 | `verify_bridge.py` had no distinction between "bridge starting" and "rejected" | Launcher could report READY on a half-up bridge | Explicit TCP → handshake → auth → `list_tools` stages with actionable messages |
| 17 | Bridge crash on port conflict printed a traceback; no single-instance guard | Two bridges fought for the port and rotated the token | Friendly error + state-dir lock file |
| 18 | Sessions leaked when a tab vanished without `close_session` | Ghost sessions held resource locks forever | Idle-session reaper in the monitor |
| 19 | `app_launch('notepad')` could not resolve shell aliases; `SendKeys` mangled typed text | Windows app control and typing failed | `Start-Process` resolution + verbatim per-character typing with UTF-8 PowerShell |
| 20 | `ui_inspect_window`/`app_list_windows` JSON parsing broke on single objects/empty output | UIA inspection crashed on one-element trees | `_safe_json` normalisation and `ArrayList` collection in PowerShell |
| 21 | Popup only read state once, before the handshake finished | Users always saw "Offline" even when paired | Polling + explicit pairing feedback + refresh-tools button |
| 22 | `windows_selftest.py` required a pre-existing token and used broken text encoding | Could not verify a fresh install | Token created on demand, UTF-8 everywhere, PASS/FAIL/SKIP report, `--json` |
| 23 | `start.bat` embedded a multi-line `python -c` and a `start "" /min cmd /c ^"… > log^"` redirect | CMD split the code into separate commands / the redirect never applied → launch failed or produced no logs | All fragile steps moved out of CMD |
| 35 | **The launcher itself was UTF-8 with an em dash, stored LF-only, and ran `chcp 65001`** | On the user's Windows PC CMD desynchronised and executed fragments of comments: `'rena' is not recognized`, `'This' is not recognized`, `'itle' is not recognized`, then `Bridge startup failed (exit code 1)` | Every `.bat` is now ASCII-only, CRLF, 30 lines, `goto`-based and contains **no logic**; `.gitattributes` pins `*.bat` to CRLF; `launcher.py` does the work |
| 36 | The launcher ran under the *system* Python while verifying with the venv's packages | `pip install` succeeded, then verification failed with "websockets library is not installed" | The launcher re-execs itself inside `.venv`, detected via `sys.prefix` (comparing `sys.executable` fails because the venv python is a symlink) |
| 24 | `open_url` was ALLOW for any http(s) GET | One-click side-effecting links (unsubscribe/delete/CSRF) executed with the user's cookies | `open_url` is CONFIRM; `web_fetch_readable` stays frictionless |
| 25 | Pending approval futures outlived a dying socket | A closed tab froze the agent for the full 120 s approval timeout | `_cancel_approvals_for(ws)` resolves them as denied and audits `approval_cancelled` |
| 26 | `session_lock()` returned a fresh lock for unknown sessions | "Exclusive" tool calls could run concurrently after a session was reaped | Locks are registered on demand |
| 27 | `rebuild_routes` aliasing was order-dependent | A server could shadow another server's `sid/tool` alias; catalog and router could drift | Deterministic `_exposed_names()` shared by both, aliases reserved first |
| 28 | Content script read the bridge state once at load | A tab opened before pairing showed "not paired" forever | `refreshBridgeState()` poll every 3 s |
| 29 | Launcher had no diagnosis path when a user's setup failed | Users could not tell token vs. port vs. extension problems | `doctor.py` with per-check remedies + `stop.bat` |
| 30 | `EmergencyStop` cached its flag in memory | `emergency_stop.py --activate` did **nothing** to an already-running bridge — the kill switch failed exactly when needed | State file is re-read on every check |
| 34 | A second approval request overwrote the card on screen; a pending approval showed no deadline | Two risky actions at once meant one could be approved blind; a silent 120 s timeout looked like a hang | Approvals are queued and shown one at a time with a countdown; the queue is cleared when the session ends |
| 33 | `bridge.pid` doubled as the instance-lock file and was never written by the bridge | `doctor.py`, `stop.bat` and the emergency CLI could not tell whether a bridge was alive; a stale pid could also block startup | Lock is `bridge.lock`; the bridge publishes/cleans up `bridge.pid` (truncated before writing) |
| 32 | Typing used `SendKeys` per character | Punctuation, `^ % + { }` and Arabic text came out mangled or missing | `SendInput` + `KEYEVENTF_UNICODE`, payload sent as base64; SendKeys only for hotkeys |
| 31 | Arena Direct adapter required a `<textarea>` | If Arena ships a contenteditable composer the adapter reports "not detected" and the extension silently does nothing | `getComposer()` accepts both, `setEditableText()` drives ProseMirror-style editors |

---

## 🚀 Installation & Launch

### Prerequisites
- Windows 10/11, Python 3.10+, Chrome or Edge
- Node.js 20+ only if you enable the optional Playwright MCP server

### Steps
1. Copy `arena-pc-control/` to the PC.
2. Double-click `start_windows.bat` (standard user — **not** Administrator).
3. Load `extension/` in `chrome://extensions` (Developer mode → Load unpacked).
4. Paste the PAIRING TOKEN in the extension popup → **Save & Pair Bridge**.
5. Open `https://arena.ai`, click **Start PC Session**, give the agent a task.

---

## ⚠️ Known Limitations

1. **DOM-based Arena integration.** Arena exposes no documented agent tool API;
   the adapter drives the chat composer (textarea + Send). If Arena's DOM changes,
   `extension/providers/arena_direct.js` needs updating (all DOM knowledge for the
   Arena Direct surface lives in that one file).
2. **Windows GUI tools require an interactive desktop session.** They return a
   clear error over SSH/service sessions with no desktop.
3. **Live Arena page not exercised in CI.** The integration suite reproduces the
   Arena DOM contract (list, prose, composer, send/stop buttons, A/B carousel) but
   cannot log into arena.ai, so selector drift is only caught on a real session.
4. **Screenshot attachments** rely on Arena's file input; if Arena changes upload
   handling, screenshots arrive as text-only observations (with a note).

---

## 📊 Test Status Summary

| Type | Count | Status |
|---|---|---|
| Python unit + integration (incl. regressions + CLI tools) | 118 | ✅ passing |
| Extension end-to-end (jsdom + real bridge) | 16 scenarios | ✅ passing |
| Node.js parser / adapter unit | 12 | ✅ passing |
| Windows desktop GUI probes | 7 tools | ⏳ requires a Windows desktop |
| Live arena.ai DOM session | — | ⏳ manual |
