"""Permission & Security Policy Gate for Arena PC Control.

Enforces three strict tiers before any local or external MCP tool executes:
  - ALLOW   : Safe, non-destructive action within permitted boundaries.
  - CONFIRM : Requires explicit human approval (destructive edits/deletes,
              package installations, arbitrary shell commands, external POSTs,
              or writes outside configured workspace roots).
  - DENY    : Hard-blocked (admin elevation, weakening Windows Defender/UAC,
              disk formatting, or reading credential/cookie stores).
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
import os
from pathlib import Path
import re
from typing import Any


class ActionTier(str, Enum):
    ALLOW = "allow"
    CONFIRM = "confirm"
    DENY = "deny"


@dataclass(frozen=True)
class PolicyVerdict:
    tier: ActionTier
    reason: str
    risk_category: str = "general"

    @property
    def allowed_immediately(self) -> bool:
        return self.tier == ActionTier.ALLOW


# Sensitive path fragments (normalized to lowercase forward-slash substrings)
_SENSITIVE_PATH_PATTERNS = (
    "/.ssh/",
    "/.gnupg/",
    "/.aws/",
    "/.azure/",
    "/.kube/",
    "/appdata/local/google/chrome/user data",
    "/appdata/local/microsoft/edge/user data",
    "/appdata/local/brave-browser/user data",
    "/appdata/roaming/mozilla/firefox/profiles",
    "/appdata/local/roblox/localstorage",
    "/windows/system32/config",
    "/windows/syswow64",
    "/etc/shadow",
    "/etc/sudoers",
)

_SENSITIVE_FILENAMES = {
    "id_rsa",
    "id_ed25519",
    "login data",
    "cookies",
    "web data",
    "local state",
    ".netrc",
    ".git-credentials",
    "auth_token.txt",
}

_SYSTEM_PROTECTED_PREFIXES = (
    "c:/windows",
    "c:/program files",
    "c:/program files (x86)",
    "/bin",
    "/sbin",
    "/usr/bin",
    "/usr/sbin",
    "/etc",
)

# Commands that weaken OS security, escalate to Admin, or destroy volumes
_BLOCKED_SHELL_REGEXES = [
    (re.compile(r"-verb\s+runas\b", re.I), "Privilege escalation (RunAs Administrator) is forbidden."),
    (re.compile(r"\b(?:sudo|su\s+-|runas\.exe)\b", re.I), "Privilege escalation to Administrator/root is forbidden."),
    (re.compile(r"\bset-mppreference\b|\bwindefend\b|\bdisable\w*monitoring\b", re.I), "Modifying Windows Defender / security settings is forbidden."),
    (re.compile(r"\b(?:bcdedit|diskpart|format-volume|format\s+[a-z]:|cipher\s+/w|vssadmin\s+delete)\b", re.I), "Disk/boot destructive system utility is blocked."),
    (re.compile(r"\breg(?:\.exe)?\s+(?:save|export|delete)\s+hklm", re.I), "Direct HKLM registry hive export/deletion is blocked."),
    (re.compile(r"\b(?:enablelua|consentpromptbehavioradmin)\b", re.I), "Modifying Windows UAC policy is forbidden."),
    (re.compile(r"\b(?:rm\s+-rf\s+/(?:\s|$)|remove-item\s+['\"]?[a-z]:\\['\"]?\s+.*-recurse)", re.I), "Root drive recursive deletion is blocked."),
    (re.compile(r"\b(?:\.roblosecurity|mimikatz|sekurlsa|lsass)\b", re.I), "Credential harvesting pattern is blocked."),
]

# Commands that install software, mutate processes, delete files, or transmit data externally
_CONFIRM_SHELL_REGEXES = [
    (re.compile(r"\b(?:winget|choco|scoop|msiexec|pip3?\s+install|npm\s+i(?:nstall)?|npx\s+-y)\b", re.I), "Software/package installation requires user confirmation.", "installation"),
    (re.compile(r"\b(?:remove-item|del\b|erase\b|rmdir\b|rm\b|unlink\b)", re.I), "Deleting files via shell requires user confirmation.", "destructive"),
    (re.compile(r"\b(?:stop-process|taskkill|kill\b|pkill\b|restart-computer|shutdown\b)", re.I), "Stopping processes or power actions requires user confirmation.", "destructive"),
    (re.compile(r"\b(?:invoke-restmethod|invoke-webrequest|curl\b|wget\b|scp\b|ftp\b|nc\b|netcat\b)", re.I), "Network transfer / external HTTP call from shell requires confirmation.", "network"),
    (re.compile(r"\b(?:set-content|add-content|out-file|new-item|move-item|copy-item|reg\s+add)\b|[>|]{1,2}", re.I), "State-modifying shell command or redirection requires confirmation.", "shell_write"),
]

# Strictly read-only, non-chained commands allowed without popup when allowReadOnlyShellWithoutConfirm=True
_SAFE_READONLY_PREFIXES = (
    "get-childitem",
    "get-location",
    "get-content",
    "get-process",
    "get-service",
    "get-computerinfo",
    "get-date",
    "systeminfo",
    "whoami",
    "hostname",
    "ipconfig",
    "where.exe",
    "which ",
    "pwd",
    "ls",
    "dir",
    "echo ",
    "git status",
    "git log",
    "git diff",
    "git branch",
    "python --version",
    "python3 --version",
    "node --version",
    "npm --version",
)

_SHELL_CHAIN_OPERATORS = re.compile(r"[;&|`$]|\$\(|\r|\n")


def _norm_path(raw_path: str) -> str:
    expanded = os.path.expandvars(os.path.expanduser(str(raw_path or "").strip()))
    if re.match(r"^[a-zA-Z]:[/\\]", expanded):
        # Preserve Windows drive-letter roots even when evaluated on POSIX CI
        from pathlib import PureWindowsPath

        return PureWindowsPath(expanded).as_posix().lower().rstrip("/")
    try:
        resolved = str(Path(expanded).resolve())
    except Exception:
        resolved = os.path.abspath(expanded)
    return resolved.replace("\\", "/").lower().rstrip("/") or "/"


class PolicyEngine:
    """Evaluates local and external MCP tool invocations against safety rules."""

    def __init__(self, config: dict[str, Any] | None = None) -> None:
        cfg = dict(config or {})
        raw_roots = cfg.get(
            "allowedWriteRoots",
            ["~/Desktop", "~/Documents", "~/Downloads", "~/Projects"],
        )
        self.allowed_write_roots = [_norm_path(r) for r in raw_roots if str(r).strip()]
        self.require_confirm_outside_roots = bool(cfg.get("requireConfirmForOutsideRoots", True))
        self.require_confirm_for_shell = bool(cfg.get("requireConfirmForShell", True))
        self.allow_readonly_shell = bool(cfg.get("allowReadOnlyShellWithoutConfirm", True))
        self.require_confirm_for_input = bool(cfg.get("requireConfirmForInputSimulation", False))
        self.require_confirm_for_app_launch = bool(cfg.get("requireConfirmForAppLaunch", False))
        self.require_confirm_for_network = bool(cfg.get("requireConfirmForNetworkRequests", True))

    def check_path_read(self, path_str: str) -> PolicyVerdict:
        if not path_str or not str(path_str).strip():
            return PolicyVerdict(ActionTier.DENY, "Empty file path.", "filesystem")
        norm = _norm_path(path_str)
        base = norm.rsplit("/", 1)[-1]
        if base in _SENSITIVE_FILENAMES or base.startswith(".env"):
            return PolicyVerdict(
                ActionTier.CONFIRM if base.startswith(".env") else ActionTier.DENY,
                f"Sensitive file '{base}' is protected.",
                "sensitive_data",
            )
        for pat in _SENSITIVE_PATH_PATTERNS:
            if pat in norm:
                return PolicyVerdict(
                    ActionTier.DENY,
                    f"Access to sensitive credential/browser directory ({pat}) is blocked.",
                    "sensitive_data",
                )
        return PolicyVerdict(ActionTier.ALLOW, "Read path permitted.", "filesystem")

    def check_path_write(self, path_str: str, *, destructive: bool = False) -> PolicyVerdict:
        read_check = self.check_path_read(path_str)
        if read_check.tier == ActionTier.DENY:
            return read_check

        norm = _norm_path(path_str)
        for sys_prefix in _SYSTEM_PROTECTED_PREFIXES:
            if norm == sys_prefix or norm.startswith(sys_prefix + "/"):
                return PolicyVerdict(
                    ActionTier.DENY,
                    f"Writing inside OS system directory '{sys_prefix}' is forbidden.",
                    "system_integrity",
                )

        if destructive:
            return PolicyVerdict(
                ActionTier.CONFIRM,
                f"Destructive file operation on '{path_str}' requires user approval.",
                "destructive",
            )

        in_allowed_root = any(
            norm == root or norm.startswith(root + "/")
            for root in self.allowed_write_roots
        )
        if not in_allowed_root and self.require_confirm_outside_roots:
            return PolicyVerdict(
                ActionTier.CONFIRM,
                f"Path '{path_str}' is outside allowedWriteRoots; confirmation required.",
                "outside_workspace",
            )
        return PolicyVerdict(ActionTier.ALLOW, "Write within allowed workspace root.", "filesystem")

    def evaluate_shell(self, command: str) -> PolicyVerdict:
        cmd = (command or "").strip()
        if not cmd:
            return PolicyVerdict(ActionTier.DENY, "Empty shell command.", "shell")

        for regex, msg in _BLOCKED_SHELL_REGEXES:
            if regex.search(cmd):
                return PolicyVerdict(ActionTier.DENY, msg, "security_violation")

        for pat in _SENSITIVE_PATH_PATTERNS:
            win_pat = pat.replace("/", "\\")
            if pat in cmd.lower() or win_pat in cmd.lower():
                return PolicyVerdict(
                    ActionTier.DENY,
                    f"Shell access to sensitive path '{pat}' is blocked.",
                    "sensitive_data",
                )

        for regex, msg, cat in _CONFIRM_SHELL_REGEXES:
            if regex.search(cmd):
                return PolicyVerdict(ActionTier.CONFIRM, msg, cat)

        low = cmd.lower()
        if (
            self.allow_readonly_shell
            and not _SHELL_CHAIN_OPERATORS.search(cmd)
            and any(low == p.strip() or low.startswith(p) for p in _SAFE_READONLY_PREFIXES)
        ):
            return PolicyVerdict(ActionTier.ALLOW, "Read-only diagnostic command.", "shell_readonly")

        if self.require_confirm_for_shell:
            return PolicyVerdict(
                ActionTier.CONFIRM,
                f"Terminal/PowerShell command '{cmd[:80]}' requires approval.",
                "shell",
            )
        return PolicyVerdict(ActionTier.ALLOW, "Shell command permitted by policy.", "shell")

    def evaluate_tool(self, tool_name: str, arguments: dict[str, Any] | None) -> PolicyVerdict:
        args = dict(arguments or {})
        bare = tool_name.split("/")[-1].split(".")[-1]

        # 1. Built-in Filesystem tools
        if bare in ("fs_read", "fs_list", "fs_stat", "fs_search"):
            return self.check_path_read(str(args.get("path", ".")))

        if bare in ("fs_write", "fs_edit", "fs_mkdir"):
            return self.check_path_write(str(args.get("path", "")), destructive=False)

        if bare == "fs_move":
            src_check = self.check_path_write(str(args.get("source", "")), destructive=False)
            if src_check.tier == ActionTier.DENY:
                return src_check
            dst_check = self.check_path_write(str(args.get("destination", "")), destructive=False)
            if dst_check.tier == ActionTier.DENY:
                return dst_check
            if src_check.tier == ActionTier.CONFIRM or dst_check.tier == ActionTier.CONFIRM:
                return PolicyVerdict(
                    ActionTier.CONFIRM,
                    "Moving file outside allowed workspace roots requires approval.",
                    "filesystem",
                )
            return PolicyVerdict(ActionTier.ALLOW, "File move within allowed roots.", "filesystem")

        if bare == "fs_delete":
            return self.check_path_write(str(args.get("path", "")), destructive=True)

        # 2. Shell / PowerShell tools (built-in or external Windows-MCP Powershell-Tool)
        if bare in ("shell_exec", "Powershell-Tool", "powershell"):
            cmd = str(args.get("command") or args.get("script") or "")
            return self.evaluate_shell(cmd)

        # 3. Application launch & termination
        if bare == "app_close_window":
            return PolicyVerdict(
                ActionTier.CONFIRM,
                f"Closing application window '{args.get('title_or_pid', '')}' requires confirmation.",
                "destructive",
            )
        if bare in ("app_launch", "App-Tool"):
            executable = str(args.get("application") or args.get("name") or "")
            if re.search(r"\.(?:msi|bat|cmd|ps1|vbs|reg)$", executable, re.I):
                return PolicyVerdict(
                    ActionTier.CONFIRM,
                    f"Launching installer/script '{executable}' requires confirmation.",
                    "installation",
                )
            if self.require_confirm_for_app_launch:
                return PolicyVerdict(
                    ActionTier.CONFIRM,
                    f"Launching application '{executable}' requires confirmation.",
                    "app_control",
                )
            return PolicyVerdict(ActionTier.ALLOW, "Application launch permitted.", "app_control")

        # 4. Keyboard & Mouse simulation
        if bare in ("input_keyboard", "Shortcut-Tool"):
            hotkey = str(args.get("hotkey") or args.get("shortcut") or "").lower()
            if any(k in hotkey for k in ("alt+f4", "win+r", "ctrl+alt+del", "cmd+q")):
                return PolicyVerdict(
                    ActionTier.CONFIRM,
                    f"System shortcut '{hotkey}' requires confirmation.",
                    "input_control",
                )
            if self.require_confirm_for_input:
                return PolicyVerdict(
                    ActionTier.CONFIRM,
                    "Keyboard simulation requires confirmation per policy.",
                    "input_control",
                )
            return PolicyVerdict(ActionTier.ALLOW, "Keyboard input permitted.", "input_control")

        if bare in ("input_mouse", "Click-Tool", "Move-Tool", "Scroll-Tool"):
            if self.require_confirm_for_input:
                return PolicyVerdict(
                    ActionTier.CONFIRM,
                    "Mouse simulation requires confirmation per policy.",
                    "input_control",
                )
            return PolicyVerdict(ActionTier.ALLOW, "Mouse input permitted.", "input_control")

        # 5. Browser / Network tools (built-in web_fetch_readable, open_url, Playwright MCP)
        if bare in ("web_fetch_readable", "open_url", "browser_navigate"):
            url = str(args.get("url") or "")
            if re.match(r"^(?:file|javascript|data):", url, re.I):
                return PolicyVerdict(
                    ActionTier.DENY,
                    f"Disallowed URL scheme in '{url[:40]}'.",
                    "security_violation",
                )
            method = str(args.get("method") or "GET").upper()
            if method not in ("GET", "HEAD") and self.require_confirm_for_network:
                return PolicyVerdict(
                    ActionTier.CONFIRM,
                    f"External HTTP {method} transmission to '{url[:80]}' requires confirmation.",
                    "network",
                )
            return PolicyVerdict(ActionTier.ALLOW, "Safe web navigation/read permitted.", "browser")

        if bare in ("browser_file_upload",):
            return PolicyVerdict(
                ActionTier.CONFIRM,
                "Uploading local files to an external website requires confirmation.",
                "external_transmission",
            )

        # 6. Read-only inspection, screenshots, memory
        if bare in (
            "system_info",
            "app_list_windows",
            "app_focus_window",
            "ui_inspect_window",
            "screen_capture",
            "memory_save",
            "memory_recall",
            "memory_list_projects",
            "memory_delete",
            "browser_snapshot",
            "browser_click",
            "browser_type",
            "browser_press_key",
            "browser_wait_for",
            "browser_tabs",
            "browser_take_screenshot",
            "State-Tool",
        ):
            return PolicyVerdict(ActionTier.ALLOW, f"Tool '{bare}' permitted.", "standard")

        # Unknown external MCP tools: allow read/list/get/snapshot, confirm mutating ones
        if re.search(r"(?:delete|remove|destroy|install|upload|send|exec|run|kill)", bare, re.I):
            return PolicyVerdict(
                ActionTier.CONFIRM,
                f"External tool '{tool_name}' appears mutating; confirmation required.",
                "external_mcp",
            )

        return PolicyVerdict(ActionTier.ALLOW, f"External MCP tool '{tool_name}' permitted.", "external_mcp")
