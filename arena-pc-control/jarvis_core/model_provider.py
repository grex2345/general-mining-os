"""Model Provider Management — Abstraction for independent JARVIS AI models.

JARVIS Core can operate independently (MODE A) using its own configured AI model,
or serve as infrastructure for external Arena agents (MODE B). This module
abstracts the model provider so JARVIS is not tied to a single AI provider.

Supported provider types:
  * 'local'     — Local model via llama.cpp / ollama / similar (HTTP API)
  * 'openai'    — OpenAI-compatible API (OpenAI, Azure, Together, etc.)
  * 'anthropic' — Anthropic Claude API
  * 'arena'     — Arena.ai native agent (when JARVIS runs as Arena infrastructure)
  * 'mock'      — Mock provider for testing (no real AI calls)

Configuration is stored in ~/.arena-pc-control/providers.json
"""

from __future__ import annotations

import json
from pathlib import Path
import time
from typing import Any


PROVIDERS_FILE = Path.home() / ".arena-pc-control" / "providers.json"


class ModelProvider:
    """Abstract interface for a model provider."""

    def __init__(self, name: str, provider_type: str, config: dict[str, Any]) -> None:
        self.name = name
        self.provider_type = provider_type
        self.config = dict(config or {})
        self.enabled = bool(config.get("enabled", True))
        self.created_at = time.time()

    def is_available(self) -> bool:
        """Return True if the provider is configured and likely reachable."""
        return self.enabled

    async def complete(self, messages: list[dict[str, str]], **kwargs: Any) -> str:
        """Generate a completion. Must be implemented by subclasses."""
        raise NotImplementedError

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "type": self.provider_type,
            "enabled": self.enabled,
            "config": self.config,
        }


class MockProvider(ModelProvider):
    """Mock provider for testing — returns deterministic responses without real AI."""

    async def complete(self, messages: list[dict[str, str]], **kwargs: Any) -> str:
        last_user = ""
        for m in reversed(messages):
            if m.get("role") == "user":
                last_user = m.get("content", "")
                break
        # Simple echo-based mock: acknowledge the objective
        return (
            f"[MOCK PROVIDER] Received objective: {last_user[:200]}\n"
            "I am JARVIS in mock mode. Configure a real model provider to execute autonomously.\n"
            "Plan: 1) Analyze environment 2) Execute tools 3) Verify results 4) Report."
        )


class OpenAICompatibleProvider(ModelProvider):
    """OpenAI-compatible HTTP API provider (OpenAI, Azure, Together, etc.)."""

    async def complete(self, messages: list[dict[str, str]], **kwargs: Any) -> str:
        try:
            import httpx  # type: ignore
        except ImportError:
            return "[ERROR] httpx is not installed. Install with: pip install httpx"

        api_base = self.config.get("api_base", "https://api.openai.com/v1")
        api_key = self.config.get("api_key", "")
        model = self.config.get("model", "gpt-4")
        temperature = float(kwargs.get("temperature", self.config.get("temperature", 0.7)))

        headers = {
            "Content-Type": "application/json",
        }
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"

        payload = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": int(kwargs.get("max_tokens", self.config.get("max_tokens", 2000))),
        }

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(
                    f"{api_base.rstrip('/')}/chat/completions",
                    headers=headers,
                    json=payload,
                )
                resp.raise_for_status()
                data = resp.json()
                return data["choices"][0]["message"]["content"]
        except Exception as exc:
            return f"[ERROR] Model provider '{self.name}' failed: {exc}"


class AnthropicProvider(ModelProvider):
    """Anthropic Claude API provider."""

    async def complete(self, messages: list[dict[str, str]], **kwargs: Any) -> str:
        try:
            import httpx  # type: ignore
        except ImportError:
            return "[ERROR] httpx is not installed. Install with: pip install httpx"

        api_key = self.config.get("api_key", "")
        model = self.config.get("model", "claude-3-opus-20240229")
        max_tokens = int(kwargs.get("max_tokens", self.config.get("max_tokens", 2000)))

        # Convert messages to Anthropic format
        system_message = ""
        anthropic_messages = []
        for m in messages:
            if m.get("role") == "system":
                system_message = m.get("content", "")
            else:
                anthropic_messages.append({"role": m.get("role", "user"), "content": m.get("content", "")})

        headers = {
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        }

        payload = {
            "model": model,
            "max_tokens": max_tokens,
            "messages": anthropic_messages,
        }
        if system_message:
            payload["system"] = system_message

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers=headers,
                    json=payload,
                )
                resp.raise_for_status()
                data = resp.json()
                return data["content"][0]["text"]
        except Exception as exc:
            return f"[ERROR] Model provider '{self.name}' failed: {exc}"


class LocalProvider(ModelProvider):
    """Local model provider (llama.cpp, ollama, etc.) via HTTP API."""

    async def complete(self, messages: list[dict[str, str]], **kwargs: Any) -> str:
        try:
            import httpx  # type: ignore
        except ImportError:
            return "[ERROR] httpx is not installed. Install with: pip install httpx"

        api_base = self.config.get("api_base", "http://127.0.0.1:11434")
        model = self.config.get("model", "llama3")

        # Combine messages into a single prompt for local models
        prompt = "\n".join(
            f"{m.get('role', 'user').upper()}: {m.get('content', '')}" for m in messages
        )

        payload = {
            "model": model,
            "prompt": prompt,
            "stream": False,
            "temperature": float(kwargs.get("temperature", self.config.get("temperature", 0.7))),
        }

        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                resp = await client.post(
                    f"{api_base.rstrip('/')}/api/generate",
                    json=payload,
                )
                resp.raise_for_status()
                data = resp.json()
                return data.get("response", "")
        except Exception as exc:
            return f"[ERROR] Local model provider '{self.name}' failed: {exc}"


class ArenaProvider(ModelProvider):
    """Arena.ai native provider — delegates to Arena's own agent interface.

    When JARVIS runs as infrastructure for an external Arena agent (MODE B),
    this provider is used to forward reasoning requests to Arena.
    """

    async def complete(self, messages: list[dict[str, str]], **kwargs: Any) -> str:
        # In MODE B, JARVIS does not generate its own reasoning — it executes
        # tools on behalf of the external agent. This provider is a placeholder
        # that acknowledges delegation.
        return (
            "[ARENA PROVIDER] JARVIS is operating in MODE B (External Agent Infrastructure). "
            "Reasoning is handled by the connected Arena agent. JARVIS provides tools, "
            "execution, observations, and infrastructure only."
        )


PROVIDER_CLASSES: dict[str, type[ModelProvider]] = {
    "mock": MockProvider,
    "openai": OpenAICompatibleProvider,
    "anthropic": AnthropicProvider,
    "local": LocalProvider,
    "arena": ArenaProvider,
}


class ModelProviderManager:
    """Manages multiple model providers and selects the active one."""

    def __init__(self, providers_file: Path | None = None) -> None:
        self.providers_file = providers_file or PROVIDERS_FILE
        self.providers_file.parent.mkdir(parents=True, exist_ok=True)
        self._providers: dict[str, ModelProvider] = {}
        self._active_provider_name: str | None = None
        self._load()

    def _load(self) -> None:
        if self.providers_file.exists():
            try:
                data = json.loads(self.providers_file.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                data = {}
        else:
            data = {}

        providers = data.get("providers", [])
        for p in providers:
            ptype = p.get("type", "mock")
            cls = PROVIDER_CLASSES.get(ptype, MockProvider)
            provider = cls(name=p.get("name", "default"), provider_type=ptype, config=p.get("config", {}))
            provider.enabled = bool(p.get("enabled", True))
            self._providers[provider.name] = provider

        self._active_provider_name = data.get("active_provider")
        if not self._active_provider_name and self._providers:
            self._active_provider_name = next(iter(self._providers))

        # Always ensure a mock provider exists for safe fallback
        if "mock" not in self._providers:
            self._providers["mock"] = MockProvider(name="mock", provider_type="mock", config={})
            if not self._active_provider_name:
                self._active_provider_name = "mock"

    def save(self) -> None:
        data = {
            "active_provider": self._active_provider_name,
            "providers": [p.to_dict() for p in self._providers.values()],
        }
        self.providers_file.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")

    def add_provider(
        self,
        name: str,
        provider_type: str,
        config: dict[str, Any] | None = None,
        enabled: bool = True,
        set_active: bool = False,
    ) -> ModelProvider:
        cls = PROVIDER_CLASSES.get(provider_type, MockProvider)
        provider = cls(name=name, provider_type=provider_type, config=config or {})
        provider.enabled = enabled
        self._providers[name] = provider
        if set_active or not self._active_provider_name:
            self._active_provider_name = name
        self.save()
        return provider

    def get_provider(self, name: str) -> ModelProvider | None:
        return self._providers.get(name)

    def get_active_provider(self) -> ModelProvider | None:
        if self._active_provider_name:
            return self._providers.get(self._active_provider_name)
        return None

    def set_active_provider(self, name: str) -> bool:
        if name in self._providers:
            self._active_provider_name = name
            self.save()
            return True
        return False

    def list_providers(self) -> list[dict[str, Any]]:
        return [p.to_dict() for p in self._providers.values()]

    async def complete(self, messages: list[dict[str, str]], **kwargs: Any) -> str:
        provider = self.get_active_provider()
        if not provider:
            return "[ERROR] No active model provider configured."
        if not provider.is_available():
            return f"[ERROR] Active provider '{provider.name}' is not available."
        return await provider.complete(messages, **kwargs)


# Global singleton
model_provider_manager = ModelProviderManager()
