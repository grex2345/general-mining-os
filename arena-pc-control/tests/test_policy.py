"""Unit tests for PolicyEngine security & permission tiers."""

from __future__ import annotations

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from bridge.policy import ActionTier, PolicyEngine  # noqa: E402


def make_policy(tmp_path: Path) -> PolicyEngine:
    return PolicyEngine(
        {
            "allowedWriteRoots": [str(tmp_path / "workspace")],
            "requireConfirmForOutsideRoots": True,
            "requireConfirmForShell": True,
            "allowReadOnlyShellWithoutConfirm": True,
        }
    )


def test_sensitive_paths_are_hard_denied(tmp_path: Path) -> None:
    policy = make_policy(tmp_path)

    ssh = policy.evaluate_tool("fs_read", {"path": "~/.ssh/id_rsa"})
    assert ssh.tier == ActionTier.DENY

    chrome_cookies = policy.evaluate_tool(
        "fs_read",
        {"path": "C:/Users/Alice/AppData/Local/Google/Chrome/User Data/Default/Cookies"},
    )
    assert chrome_cookies.tier == ActionTier.DENY

    roblox_storage = policy.evaluate_tool(
        "fs_read",
        {"path": "C:/Users/Alice/AppData/Local/Roblox/LocalStorage/RobloxCookies.dat"},
    )
    assert roblox_storage.tier == ActionTier.DENY


def test_workspace_vs_outside_writes_and_deletes(tmp_path: Path) -> None:
    policy = make_policy(tmp_path)
    inside = tmp_path / "workspace" / "notes.md"
    outside = tmp_path / "other_folder" / "notes.md"

    assert policy.evaluate_tool("fs_write", {"path": str(inside)}).tier == ActionTier.ALLOW
    assert policy.evaluate_tool("fs_write", {"path": str(outside)}).tier == ActionTier.CONFIRM
    assert policy.evaluate_tool("fs_delete", {"path": str(inside)}).tier == ActionTier.CONFIRM
    assert (
        policy.evaluate_tool("fs_write", {"path": "C:/Windows/System32/drivers/etc/hosts"}).tier
        == ActionTier.DENY
    )


def test_shell_security_and_confirmation_tiers(tmp_path: Path) -> None:
    policy = make_policy(tmp_path)

    # Privilege escalation & Defender tampering -> DENY
    assert (
        policy.evaluate_tool(
            "shell_exec",
            {"command": "Start-Process powershell -Verb RunAs"},
        ).tier
        == ActionTier.DENY
    )
    assert (
        policy.evaluate_tool(
            "shell_exec",
            {"command": "Set-MpPreference -DisableRealtimeMonitoring $true"},
        ).tier
        == ActionTier.DENY
    )
    assert (
        policy.evaluate_tool("shell_exec", {"command": "Format-Volume -DriveLetter D"}).tier
        == ActionTier.DENY
    )

    # Package installation, deletion, network transfer -> CONFIRM
    assert (
        policy.evaluate_tool("shell_exec", {"command": "winget install VideoLAN.VLC"}).tier
        == ActionTier.CONFIRM
    )
    assert (
        policy.evaluate_tool("shell_exec", {"command": "Remove-Item ./temp.txt"}).tier
        == ActionTier.CONFIRM
    )
    assert (
        policy.evaluate_tool(
            "shell_exec",
            {"command": "Invoke-RestMethod -Uri https://example.com/upload -Method Post"},
        ).tier
        == ActionTier.CONFIRM
    )

    # Read-only inspection -> ALLOW (unless chained with `;` or `|`)
    assert policy.evaluate_tool("shell_exec", {"command": "git status"}).tier == ActionTier.ALLOW
    assert (
        policy.evaluate_tool("shell_exec", {"command": "Get-ChildItem"}).tier == ActionTier.ALLOW
    )
    assert (
        policy.evaluate_tool("shell_exec", {"command": "git status; rm -rf /tmp/x"}).tier
        != ActionTier.ALLOW
    )


def test_browser_and_shortcut_guards(tmp_path: Path) -> None:
    policy = make_policy(tmp_path)

    assert (
        policy.evaluate_tool("open_url", {"url": "https://www.youtube.com/results?search_query=mcp"}).tier
        == ActionTier.ALLOW
    )
    assert (
        policy.evaluate_tool("open_url", {"url": "file:///C:/Windows/win.ini"}).tier
        == ActionTier.DENY
    )
    assert (
        policy.evaluate_tool("browser_file_upload", {"paths": ["doc.pdf"]}).tier
        == ActionTier.CONFIRM
    )
    assert (
        policy.evaluate_tool("input_keyboard", {"hotkey": "alt+f4"}).tier == ActionTier.CONFIRM
    )
