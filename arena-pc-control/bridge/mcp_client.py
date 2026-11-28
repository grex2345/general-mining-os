"""Standard JSON-RPC 2.0 stdio MCP Client & Multi-Server Router."""

from __future__ import annotations

import json
import os
from pathlib import Path
import queue
import subprocess
import sys
import threading
import time
from typing import Any


MCP_CLIENT_VERSION = "0.2.0"


class MCPProtocolError(RuntimeError):
    """Raised when an MCP server violates the JSON-RPC framing contract."""
# Newest first. The server picks/echoes the version it supports.
MCP_PROTOCOL_VERSION = "2025-06-18"
MCP_PROTOCOL_VERSIONS = ("2025-06-18", "2025-03-26", "2024-11-05")


class MCPStdioClient:
    """Manages one child MCP server process over stdin/stdout JSON-RPC 2.0."""

    def __init__(
        self,
        server_id: str,
        command: str,
        args: list[str] | None = None,
        env: dict[str, str] | None = None,
        base_dir: str | Path | None = None,
    ) -> None:
        self.server_id = server_id
        self.command = command
        self.args = list(args or [])
        self.env = dict(env or {})
        self.base_dir = Path(base_dir or Path.cwd()).resolve()

        self.proc: subprocess.Popen[str] | None = None
        self.tools: list[dict[str, Any]] = []
        self.stderr_tail: list[str] = []
        self.last_error: str | None = None
        self.protocol_version: str = MCP_PROTOCOL_VERSION
        self.server_info: dict[str, Any] = {}

        self._req_id = 0
        self._write_lock = threading.Lock()
        self._call_lock = threading.Lock()
        self._pending_lock = threading.Lock()
        self._pending: dict[int, queue.Queue[dict[str, Any] | None]] = {}

    def _build_argv(self) -> list[str]:
        raw_cmd = os.path.expandvars(os.path.expanduser(self.command))
        resolved_args = [os.path.expandvars(os.path.expanduser(str(a))) for a in self.args]

        if raw_cmd.lower().endswith(".py"):
            script = Path(raw_cmd)
            if not script.is_absolute():
                script = (self.base_dir / script).resolve()
            return [sys.executable, "-u", str(script), *resolved_args]

        argv = [raw_cmd, *resolved_args]
        if sys.platform == "win32":
            exe_name = os.path.basename(raw_cmd).lower()
            if exe_name in ("npx", "npm", "pnpm", "yarn", "bunx"):
                argv = ["cmd.exe", "/c", *argv]
        return argv

    def is_running(self) -> bool:
        return self.proc is not None and self.proc.poll() is None

    def start(self, handshake_timeout: float = 25.0) -> None:
        if self.is_running():
            return
        argv = self._build_argv()
        child_env = dict(os.environ)
        for k, v in self.env.items():
            child_env[k] = os.path.expandvars(os.path.expanduser(str(v)))

        try:
            self.proc = subprocess.Popen(
                argv,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
                encoding="utf-8",
                errors="replace",
                cwd=str(self.base_dir),
                env=child_env,
            )
        except OSError as exc:
            self.last_error = f"Failed to start '{argv[0]}': {exc}"
            raise RuntimeError(self.last_error) from exc

        self.last_error = None
        with self._pending_lock:
            self._pending.clear()

        threading.Thread(
            target=self._stdout_loop,
            args=(self.proc,),
            daemon=True,
            name=f"mcp-out-{self.server_id}",
        ).start()
        threading.Thread(
            target=self._stderr_loop,
            args=(self.proc,),
            daemon=True,
            name=f"mcp-err-{self.server_id}",
        ).start()

        init_resp = self._request(
            "initialize",
            {
                # Offer the versions this client understands. Modern servers
                # (Playwright MCP, Windows-MCP) reject an unknown/old version and
                # would otherwise fail the handshake outright.
                "protocolVersion": MCP_PROTOCOL_VERSION,
                "capabilities": {},
                "clientInfo": {"name": "arena-pc-control", "version": MCP_CLIENT_VERSION},
            },
            timeout=handshake_timeout,
        )
        if not init_resp or "error" in init_resp:
            err_detail = (
                json.dumps(init_resp.get("error"))
                if init_resp and "error" in init_resp
                else "; ".join(self.stderr_tail[-4:]) or "handshake timed out"
            )
            self.stop()
            self.last_error = f"MCP initialize failed for '{self.server_id}': {err_detail}"
            raise RuntimeError(self.last_error)

        self.protocol_version = (
            (init_resp.get("result") or {}).get("protocolVersion") or MCP_PROTOCOL_VERSION
        )
        self.server_info = (init_resp.get("result") or {}).get("serverInfo") or {}
        self._notify("notifications/initialized", {})
        self.refresh_tools(timeout=15.0)

    def stop(self) -> None:
        with self._pending_lock:
            for q in self._pending.values():
                try:
                    q.put_nowait(None)
                except queue.Full:
                    pass
            self._pending.clear()

        proc = self.proc
        self.proc = None
        if proc is None:
            return
        try:
            if sys.platform == "win32":
                subprocess.run(
                    ["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                    capture_output=True,
                    timeout=5,
                    check=False,
                )
            else:
                proc.terminate()
                try:
                    proc.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    proc.kill()
        except Exception:
            pass

    def restart(self) -> None:
        self.stop()
        time.sleep(0.2)
        self.start()

    def _stdout_loop(self, proc: subprocess.Popen[str]) -> None:
        assert proc.stdout is not None
        for raw_line in iter(proc.stdout.readline, ""):
            line = raw_line.strip()
            if not line:
                continue
            try:
                msg = json.loads(line)
            except json.JSONDecodeError:
                # Servers sometimes print banners/warnings on stdout before the
                # JSON-RPC stream starts. Ignore noise, but keep a bounded copy
                # so a protocol bug is diagnosable instead of silent.
                self.stderr_tail.append(f"[stdout-noise] {line[:200]}")
                if len(self.stderr_tail) > 50:
                    self.stderr_tail.pop(0)
                continue
            if not isinstance(msg, dict):
                continue
            req_id = msg.get("id")
            if req_id is None:
                continue
            with self._pending_lock:
                waiter = self._pending.get(int(req_id))
            if waiter is not None:
                try:
                    waiter.put_nowait(msg)
                except queue.Full:
                    pass

        with self._pending_lock:
            for waiter in self._pending.values():
                try:
                    waiter.put_nowait(None)
                except queue.Full:
                    pass

        try:
            exit_code = proc.wait(timeout=2)
        except Exception:  # noqa: BLE001 - best effort diagnostics
            exit_code = None
        if exit_code is not None and self.last_error is None:
            tail = " | ".join(self.stderr_tail[-3:])
            self.last_error = (
                f"server '{self.server_id}' stdout closed (exit code {exit_code})"
                + (f": {tail}" if tail else "")
            )

    def _stderr_loop(self, proc: subprocess.Popen[str]) -> None:
        assert proc.stderr is not None
        for raw_line in iter(proc.stderr.readline, ""):
            line = raw_line.rstrip()
            if line:
                self.stderr_tail.append(line)
                if len(self.stderr_tail) > 50:
                    self.stderr_tail.pop(0)

    def _next_id(self) -> int:
        with self._write_lock:
            self._req_id += 1
            return self._req_id

    def _notify(self, method: str, params: dict[str, Any] | None = None) -> None:
        if not self.is_running() or self.proc is None or self.proc.stdin is None:
            raise RuntimeError(f"MCP server '{self.server_id}' is not running.")
        payload = {"jsonrpc": "2.0", "method": method, "params": params or {}}
        with self._write_lock:
            self.proc.stdin.write(json.dumps(payload) + "\n")
            self.proc.stdin.flush()

    def _request(
        self,
        method: str,
        params: dict[str, Any] | None,
        timeout: float,
    ) -> dict[str, Any] | None:
        if not self.is_running() or self.proc is None or self.proc.stdin is None:
            raise RuntimeError(f"MCP server '{self.server_id}' is not running.")
        req_id = self._next_id()
        waiter: queue.Queue[dict[str, Any] | None] = queue.Queue(maxsize=1)
        with self._pending_lock:
            self._pending[req_id] = waiter
        try:
            payload = {
                "jsonrpc": "2.0",
                "id": req_id,
                "method": method,
                "params": params or {},
            }
            with self._write_lock:
                self.proc.stdin.write(json.dumps(payload) + "\n")
                self.proc.stdin.flush()
            try:
                return waiter.get(timeout=timeout)
            except queue.Empty:
                return None
        finally:
            with self._pending_lock:
                self._pending.pop(req_id, None)

    def refresh_tools(self, timeout: float = 15.0) -> list[dict[str, Any]]:
        resp = self._request("tools/list", {}, timeout=timeout)
        if resp and "result" in resp:
            self.tools = list(resp["result"].get("tools", []))
        return self.tools

    def call_tool(
        self,
        tool_name: str,
        arguments: dict[str, Any] | None = None,
        timeout: float = 60.0,
    ) -> dict[str, Any]:
        t0 = time.monotonic()
        with self._call_lock:
            if not self.is_running():
                self.restart()
            resp = self._request(
                "tools/call",
                {"name": tool_name, "arguments": arguments or {}},
                timeout=timeout,
            )
            if resp is None and not self.is_running():
                self.restart()
                resp = self._request(
                    "tools/call",
                    {"name": tool_name, "arguments": arguments or {}},
                    timeout=timeout,
                )

            elapsed_ms = int((time.monotonic() - t0) * 1000)
            if resp is None:
                raise TimeoutError(
                    f"Tool '{tool_name}' on server '{self.server_id}' timed out after {timeout}s."
                )
            if "error" in resp:
                err = resp["error"]
                msg = err.get("message") if isinstance(err, dict) else str(err)
                return {
                    "ok": False,
                    "is_error": True,
                    "server": self.server_id,
                    "duration_ms": elapsed_ms,
                    "text": f"MCP error: {msg}",
                    "images": [],
                }

            result = resp.get("result", {})
            is_error = bool(result.get("isError", False))
            content = result.get("content", [])
            texts = [c.get("text", "") for c in content if c.get("type") == "text"]
            images = [
                {
                    "data": c["data"],
                    "mimeType": c.get("mimeType", "image/jpeg"),
                }
                for c in content
                if c.get("type") == "image" and c.get("data")
            ]
            combined_text = "\n".join(t for t in texts if t)
            if not combined_text and not images and content:
                combined_text = json.dumps(content, ensure_ascii=False)[:4000]

            return {
                "ok": not is_error,
                "is_error": is_error,
                "server": self.server_id,
                "duration_ms": elapsed_ms,
                "text": combined_text,
                "images": images,
            }


class MCPRouter:
    """Aggregates multiple MCP servers and routes tool calls by tool name."""

    def __init__(self, base_dir: str | Path | None = None) -> None:
        self.base_dir = Path(base_dir or Path.cwd()).resolve()
        self.clients: dict[str, MCPStdioClient] = {}
        self._route_lock = threading.Lock()
        self._routes: dict[str, tuple[MCPStdioClient, str]] = {}

    def load_servers(self, mcp_config: dict[str, Any]) -> None:
        for sid, spec in (mcp_config or {}).items():
            if not isinstance(spec, dict) or not spec.get("enabled", True):
                continue
            cmd = spec.get("command", "")
            if not cmd:
                continue
            self.clients[sid] = MCPStdioClient(
                server_id=sid,
                command=cmd,
                args=spec.get("args", []),
                env=spec.get("env", {}),
                base_dir=self.base_dir,
            )

    def start_all(self) -> dict[str, str]:
        statuses: dict[str, str] = {}
        threads: list[threading.Thread] = []
        lock = threading.Lock()

        def _boot(sid: str, client: MCPStdioClient) -> None:
            try:
                client.start()
                with lock:
                    statuses[sid] = f"online ({len(client.tools)} tools)"
            except Exception as exc:
                with lock:
                    statuses[sid] = f"error: {exc}"

        for sid, client in self.clients.items():
            t = threading.Thread(target=_boot, args=(sid, client), daemon=True)
            t.start()
            threads.append(t)
        for t in threads:
            t.join()
        self.rebuild_routes()
        return statuses

    def stop_all(self) -> None:
        for client in self.clients.values():
            client.stop()

    def _exposed_names(self) -> list[tuple[str, MCPStdioClient, str]]:
        """Deterministically map every tool to its public name.

        Rules (also enforced by `list_tools`, so the catalog and the router can
        never drift apart):
          1. Every `<server>/<tool>` alias is reserved first, so a server cannot
             shadow another server's alias with a bare tool name.
          2. A tool keeps its bare name only if that name is neither taken by an
             earlier server nor colliding with a reserved alias.
          3. Anything else is exposed as `<server>/<tool>`.
        """
        reserved = {
            f"{sid}/{tool.get('name')}"
            for sid, client in self.clients.items()
            for tool in client.tools
            if tool.get("name")
        }
        used: set[str] = set()
        entries: list[tuple[str, MCPStdioClient, str]] = []
        for sid, client in self.clients.items():
            for tool in client.tools:
                raw_name = tool.get("name")
                if not raw_name:
                    continue
                alias = f"{sid}/{raw_name}"
                exposed = raw_name if (raw_name not in used and raw_name not in reserved) else alias
                used.add(exposed)
                entries.append((exposed, client, raw_name))
        return entries

    def rebuild_routes(self) -> None:
        with self._route_lock:
            self._routes.clear()
            entries = self._exposed_names()
            for exposed, client, raw_name in entries:
                self._routes[exposed] = (client, raw_name)
            # Explicit server/tool aliases always resolve, even when the bare
            # name was claimed by another server first.
            for sid, client in self.clients.items():
                for tool in client.tools:
                    raw_name = tool.get("name")
                    if raw_name:
                        self._routes.setdefault(f"{sid}/{raw_name}", (client, raw_name))

    def list_tools(self, refresh: bool = False) -> list[dict[str, Any]]:
        if refresh:
            for client in self.clients.values():
                if client.is_running():
                    client.refresh_tools()
            self.rebuild_routes()

        by_client = {id(client): sid for sid, client in self.clients.items()}
        catalog: list[dict[str, Any]] = []
        seen: set[str] = set()
        for exposed, client, raw_name in self._exposed_names():
            if exposed in seen:
                continue
            seen.add(exposed)
            item = next(
                (dict(t) for t in client.tools if t.get("name") == raw_name),
                {"name": raw_name},
            )
            item["name"] = exposed
            item["server"] = by_client.get(id(client), "")
            catalog.append(item)
        return catalog

    def server_statuses(self) -> list[dict[str, Any]]:
        return [
            {
                "id": sid,
                "running": client.is_running(),
                "toolCount": len(client.tools),
                "lastError": client.last_error,
            }
            for sid, client in self.clients.items()
        ]

    def call_tool(
        self,
        tool_name: str,
        arguments: dict[str, Any] | None = None,
        timeout: float = 60.0,
    ) -> dict[str, Any]:
        with self._route_lock:
            route = self._routes.get(tool_name)
        if route is None:
            self.rebuild_routes()
            with self._route_lock:
                route = self._routes.get(tool_name)
        if route is None:
            available = [t["name"] for t in self.list_tools()]
            raise KeyError(
                f"Unknown tool '{tool_name}'. Available tools: {', '.join(available[:30])}"
            )
        client, real_name = route
        return client.call_tool(real_name, arguments or {}, timeout=timeout)
