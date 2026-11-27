"""Tests for JARVIS Model Provider Manager."""

from __future__ import annotations

from pathlib import Path
import sys
import tempfile

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from jarvis_core.model_provider import (
    ModelProviderManager,
    MockProvider,
    OpenAICompatibleProvider,
    AnthropicProvider,
    LocalProvider,
    ArenaProvider,
    model_provider_manager,
)  # noqa: E402


def test_mock_provider() -> None:
    provider = MockProvider(name="test_mock", provider_type="mock", config={})
    assert provider.is_available() is True
    # Mock provider should return a response without errors
    import asyncio

    response = asyncio.run(provider.complete([{"role": "user", "content": "Hello JARVIS"}]))
    assert isinstance(response, str)
    assert len(response) > 0


def test_provider_manager_add_and_list() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        providers_file = Path(tmp) / "test_providers.json"
        mgr = ModelProviderManager(providers_file=providers_file)

        # Add a mock provider
        p = mgr.add_provider(
            name="test_provider",
            provider_type="mock",
            config={},
            enabled=True,
            set_active=True,
        )
        assert p.name == "test_provider"
        assert mgr.get_active_provider() is not None
        assert mgr.get_active_provider().name == "test_provider"

        providers = mgr.list_providers()
        assert len(providers) >= 2  # mock + test_provider
        names = {p["name"] for p in providers}
        assert "test_provider" in names


def test_provider_manager_set_active() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        providers_file = Path(tmp) / "test_providers2.json"
        mgr = ModelProviderManager(providers_file=providers_file)

        mgr.add_provider(name="p1", provider_type="mock", config={}, set_active=True)
        mgr.add_provider(name="p2", provider_type="mock", config={}, set_active=False)

        assert mgr.get_active_provider().name == "p1"
        assert mgr.set_active_provider("p2") is True
        assert mgr.get_active_provider().name == "p2"
        assert mgr.set_active_provider("nonexistent") is False


def test_provider_manager_no_active_returns_mock() -> None:
    """When no provider is configured, mock provider is the fallback."""
    with tempfile.TemporaryDirectory() as tmp:
        providers_file = Path(tmp) / "test_providers3.json"
        # Don't write anything — manager creates its own mock
        mgr = ModelProviderManager(providers_file=providers_file)
        assert mgr.get_active_provider() is not None
        assert mgr.get_active_provider().provider_type == "mock"


def test_provider_types_registered() -> None:
    """All expected provider types are registered."""
    from jarvis_core.model_provider import PROVIDER_CLASSES

    assert "mock" in PROVIDER_CLASSES
    assert "openai" in PROVIDER_CLASSES
    assert "anthropic" in PROVIDER_CLASSES
    assert "local" in PROVIDER_CLASSES
    assert "arena" in PROVIDER_CLASSES
    assert PROVIDER_CLASSES["mock"] is MockProvider
    assert PROVIDER_CLASSES["openai"] is OpenAICompatibleProvider
    assert PROVIDER_CLASSES["anthropic"] is AnthropicProvider
    assert PROVIDER_CLASSES["local"] is LocalProvider
    assert PROVIDER_CLASSES["arena"] is ArenaProvider


def test_global_provider_manager_singleton() -> None:
    """The global model_provider_manager is a singleton."""
    assert model_provider_manager is not None
    assert model_provider_manager.get_active_provider() is not None
