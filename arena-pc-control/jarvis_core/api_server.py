"""JARVIS API Server — REST API for independent JARVIS operation (MODE A).

Provides a local HTTP API so JARVIS can operate without Arena.ai:

  POST   /api/v1/objective          — Submit a high-level objective for autonomous execution
  GET    /api/v1/status             — Get JARVIS status and session info
  POST   /api/v1/emergency-stop     — Activate emergency stop
  POST   /api/v1/emergency-reset    — Reset emergency stop
  GET    /api/v1/providers          — List model providers
  POST   /api/v1/providers          — Add a model provider
  POST   /api/v1/providers/active   — Set active provider
  GET    /api/v1/sessions           — List active sessions
  GET    /api/v1/memory             — Query persistent memory
  POST   /api/v1/memory             — Save to persistent memory

Runs on 127.0.0.1 only — never exposed to LAN/WAN.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any
import time

try:
    from aiohttp import web  # type: ignore
    from aiohttp import web_runner  # noqa: F401
except ImportError:  # pragma: no cover - aiohttp optional
    web = None  # type: ignore

from .agent_loop import create_jarvis_agent, JarvisAgentLoop
from .model_provider import model_provider_manager
from bridge.session_manager import session_manager


class JarvisAPIServer:
    """HTTP API server for JARVIS Core."""

    def __init__(self, host: str = "127.0.0.1", port: int = 8766) -> None:
        if web is None:
            raise ImportError(
                "aiohttp is required for the API server. Install with: pip install aiohttp"
            )
        self.host = host
        self.port = port
        self.app = web.Application()
        self._agents: dict[str, JarvisAgentLoop] = {}
        self._agent_lock = __import__("threading").Lock()
        self._runner: Any = None
        self._site: Any = None
        self._setup_routes()

    # ── Agent management ──────────────────────────────────────────────
    def _get_or_create_agent(self, session_id: str | None = None) -> JarvisAgentLoop:
        with self._agent_lock:
            if session_id and session_id in self._agents:
                return self._agents[session_id]
            agent = create_jarvis_agent(session_id=session_id)
            if session_id:
                self._agents[session_id] = agent
            return agent

    # ── Route handlers ────────────────────────────────────────────────
    async def _handle_objective(self, request: web.Request) -> web.Response:
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"ok": False, "error": "Invalid JSON body"}, status=400)

        objective = str(body.get("objective", "")).strip()
        if not objective:
            return web.json_response({"ok": False, "error": "Objective is required"}, status=400)

        project = str(body.get("project", "global"))
        session_id = str(body.get("session_id") or "")
        max_steps = int(body.get("max_steps", 50))

        agent = self._get_or_create_agent(session_id or None)
        if not agent.router.server_statuses():
            agent.start()

        # Run the async agent loop in the event loop
        result = await agent.run_objective(objective, project=project, max_steps=max_steps)

        return web.json_response(
            {
                "ok": True,
                "objective": result.objective,
                "project": result.project,
                "session_id": result.session_id,
                "success": result.success,
                "steps_completed": result.steps_completed,
                "total_steps": result.total_steps,
                "summary": result.summary,
                "errors": result.errors,
                "execution_log": result.execution_log,
                "completed_at": result.completed_at,
            }
        )

    async def _handle_status(self, request: web.Request) -> web.Response:
        agent = self._get_or_create_agent()
        return web.json_response(
            {
                "ok": True,
                "status": agent.get_status(),
                "timestamp": time.time(),
            }
        )

    async def _handle_emergency_stop(self, request: web.Request) -> web.Response:
        agent = self._get_or_create_agent()
        agent.emergency_activate(reason="api_requested")
        return web.json_response(
            {"ok": True, "message": "JARVIS emergency stop activated", "session_id": agent.session_id}
        )

    async def _handle_emergency_reset(self, request: web.Request) -> web.Response:
        agent = self._get_or_create_agent()
        agent.emergency_reset(authorized_by="api_user")
        return web.json_response(
            {"ok": True, "message": "JARVIS emergency stop reset", "session_id": agent.session_id}
        )

    async def _handle_list_providers(self, request: web.Request) -> web.Response:
        return web.json_response(
            {"ok": True, "providers": model_provider_manager.list_providers()}
        )

    async def _handle_add_provider(self, request: web.Request) -> web.Response:
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"ok": False, "error": "Invalid JSON body"}, status=400)

        name = str(body.get("name", ""))
        provider_type = str(body.get("type", "mock"))
        config = body.get("config") or {}
        enabled = bool(body.get("enabled", True))
        set_active = bool(body.get("set_active", False))

        if not name:
            return web.json_response({"ok": False, "error": "Provider name is required"}, status=400)

        model_provider_manager.add_provider(
            name=name,
            provider_type=provider_type,
            config=config,
            enabled=enabled,
            set_active=set_active,
        )
        return web.json_response({"ok": True, "message": f"Provider '{name}' added"})

    async def _handle_set_active_provider(self, request: web.Request) -> web.Response:
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"ok": False, "error": "Invalid JSON body"}, status=400)

        name = str(body.get("name", ""))
        if model_provider_manager.set_active_provider(name):
            return web.json_response({"ok": True, "message": f"Active provider set to '{name}'"})
        return web.json_response({"ok": False, "error": f"Provider '{name}' not found"}, status=404)

    async def _handle_list_sessions(self, request: web.Request) -> web.Response:
        return web.json_response(
            {"ok": True, "sessions": session_manager.list_sessions()}
        )

    async def _handle_memory_query(self, request: web.Request) -> web.Response:
        project = request.query.get("project", "global")
        query = request.query.get("query")
        limit = int(request.query.get("limit", "30"))
        agent = self._get_or_create_agent()
        entries = agent.memory.recall_context(project=project, query=query, limit=limit)
        return web.json_response({"ok": True, "project": project, "entries": entries})

    async def _handle_memory_save(self, request: web.Request) -> web.Response:
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"ok": False, "error": "Invalid JSON body"}, status=400)

        project = str(body.get("project", "global"))
        key = str(body.get("key", ""))
        value = str(body.get("value", ""))
        category = str(body.get("category", "fact"))

        if not key:
            return web.json_response({"ok": False, "error": "Memory key is required"}, status=400)

        agent = self._get_or_create_agent()
        saved = agent.memory.save_user_preference(key, value, category) if category == "preference" else agent.memory.base.save(project, key, value, category)
        return web.json_response({"ok": True, "saved": saved})

    # ── Routes ────────────────────────────────────────────────────────
    def _setup_routes(self) -> None:
        self.app.router.add_post("/api/v1/objective", self._handle_objective)
        self.app.router.add_get("/api/v1/status", self._handle_status)
        self.app.router.add_post("/api/v1/emergency-stop", self._handle_emergency_stop)
        self.app.router.add_post("/api/v1/emergency-reset", self._handle_emergency_reset)
        self.app.router.add_get("/api/v1/providers", self._handle_list_providers)
        self.app.router.add_post("/api/v1/providers", self._handle_add_provider)
        self.app.router.add_post("/api/v1/providers/active", self._handle_set_active_provider)
        self.app.router.add_get("/api/v1/sessions", self._handle_list_sessions)
        self.app.router.add_get("/api/v1/memory", self._handle_memory_query)
        self.app.router.add_post("/api/v1/memory", self._handle_memory_save)

    # ── Lifecycle ─────────────────────────────────────────────────────
    async def start(self) -> None:
        self._runner = web.AppRunner(self.app)
        await self._runner.setup()
        self._site = web.TCPSite(self._runner, self.host, self.port)
        await self._site.start()
        print(f"JARVIS API Server listening on http://{self.host}:{self.port}")

    async def stop(self) -> None:
        if self._site:
            await self._site.stop()
        if self._runner:
            await self._runner.cleanup()
        for agent in self._agents.values():
            agent.stop()


async def run_api_server(host: str = "127.0.0.1", port: int = 8766) -> None:
    server = JarvisAPIServer(host=host, port=port)
    await server.start()
    # Keep running
    try:
        while True:
            await asyncio.sleep(3600)
    except asyncio.CancelledError:
        await server.stop()


def main() -> None:
    import asyncio

    asyncio.run(run_api_server())


if __name__ == "__main__":
    main()
