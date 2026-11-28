"""Runs the browser-extension integration suite (jsdom + real Bridge).

`pytest -q` therefore covers the whole chain — policy, bridge, MCP server and
the actual Chrome extension sources — with a single command.

Skips (pytest skip, not failure) when Node.js or the optional test
dependencies in `.testdeps/` are unavailable, because those are development
tools, not runtime requirements.
"""

from __future__ import annotations

from pathlib import Path
import shutil
import subprocess
import sys

import pytest

ROOT = Path(__file__).resolve().parent.parent
DEPS = ROOT / ".testdeps" / "node_modules"


@pytest.mark.skipif(shutil.which("node") is None, reason="Node.js not installed")
@pytest.mark.skipif(not DEPS.exists(), reason="run: cd .testdeps && npm install")
def test_extension_end_to_end_against_real_bridge() -> None:
    proc = subprocess.run(
        [sys.executable, str(ROOT / "tests" / "test_extension_e2e.py")],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        timeout=600,
        check=False,
    )
    output = (proc.stdout or "") + (proc.stderr or "")
    if proc.returncode != 0:
        tail = "\n".join(output.strip().splitlines()[-40:])
        pytest.fail(f"extension integration suite failed:\n{tail}")
    assert "# fail 0" in output, output[-2000:]
    assert "# pass" in output, output[-2000:]
