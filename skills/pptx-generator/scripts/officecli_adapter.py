#!/usr/bin/env python3
"""PPTX-specific read-only helpers for the installer-managed OfficeCLI tool."""

from __future__ import annotations

import json
import os
import platform
import re
import subprocess
from pathlib import Path
from typing import Any, Mapping, Sequence


PACKAGE_NAME = "@officecli/officecli"
PINNED_VERSION = "1.0.143"
PACKAGE_SPEC = f"{PACKAGE_NAME}@{PINNED_VERSION}"
MANAGED_TARGET_PARTS = (".agents", "tools", "officecli")
SKIP_UPDATE_ENV = "OFFICECLI_SKIP_UPDATE"

COMMAND_TABLES: dict[str, dict[str, tuple[str, ...]]] = {
    "1.0.143": {
        "validate": ("validate",),
        "view": ("view",),
        "screenshot": ("screenshot",),
        "batch": ("batch",),
    }
}
PROBE_HELP_FAMILIES = ("validate", "view", "screenshot", "batch")


class OfficeCLIAdapterError(ValueError):
    """An adapter policy or readiness failure with a stable code."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code

    def as_dict(self) -> dict[str, str]:
        return {"code": self.code, "message": str(self)}


def _home_path(home: str | os.PathLike[str] | None = None) -> Path:
    if home is not None:
        return Path(home).expanduser()
    value = os.environ.get("HOME")
    if not value:
        raise OfficeCLIAdapterError("HOME_UNAVAILABLE", "HOME is required to resolve the managed OfficeCLI prefix")
    return Path(value).expanduser()


def managed_target(home: str | os.PathLike[str] | None = None) -> Path:
    """Return the one supported local, non-routable OfficeCLI npm prefix."""

    return _home_path(home).joinpath(*MANAGED_TARGET_PARTS).absolute()


def _platform_name(value: str | None = None) -> str:
    return (value or platform.system()).lower()


def managed_shim_candidates(
    target: str | os.PathLike[str], platform_name: str | None = None
) -> tuple[Path, ...]:
    shim_root = Path(target) / "node_modules" / ".bin"
    if _platform_name(platform_name).startswith(("win", "cygwin")):
        return (
            shim_root / "officecli.cmd",
            shim_root / "officecli.exe",
            shim_root / "officecli",
            shim_root / "officecli.ps1",
        )
    return (shim_root / "officecli",)


def resolve_officecli_bin(
    *,
    home: str | os.PathLike[str] | None = None,
    target: str | os.PathLike[str] | None = None,
    environ: Mapping[str, str] | None = None,
    platform_name: str | None = None,
) -> dict[str, Any]:
    """Resolve an explicit override, otherwise only the managed npm prefix."""

    env = os.environ if environ is None else environ
    managed = Path(target).absolute() if target is not None else managed_target(home)
    override = env.get("OFFICECLI_BIN", "").strip()
    if override:
        candidate = Path(override).expanduser()
        if not candidate.is_absolute():
            return {
                "present": False,
                "path": None,
                "source": "OFFICECLI_BIN",
                "managed_target": str(managed),
                "candidates": [str(candidate)],
                "error": {
                    "code": "OFFICECLI_OVERRIDE_NOT_ABSOLUTE",
                    "message": "OFFICECLI_BIN must be an absolute path",
                },
            }
        candidate = candidate.absolute()
        return {
            "present": candidate.is_file(),
            "path": str(candidate) if candidate.is_file() else None,
            "source": "OFFICECLI_BIN",
            "managed_target": str(managed),
            "candidates": [str(candidate)],
            "error": None if candidate.is_file() else {
                "code": "OFFICECLI_OVERRIDE_MISSING",
                "message": f"OFFICECLI_BIN does not name a file: {candidate}",
            },
        }

    candidates = managed_shim_candidates(managed, platform_name)
    for candidate in candidates:
        if candidate.is_file():
            return {
                "present": True,
                "path": str(candidate.absolute()),
                "source": "managed-prefix",
                "managed_target": str(managed),
                "candidates": [str(item.absolute()) for item in candidates],
                "error": None,
            }
    return {
        "present": False,
        "path": None,
        "source": "managed-prefix",
        "managed_target": str(managed),
        "candidates": [str(item.absolute()) for item in candidates],
        "error": {
            "code": "OFFICECLI_NOT_PRESENT",
            "message": "No OfficeCLI shim exists under the installer-managed prefix; run rose-aili install or update without --skip-officecli",
        },
    }


def officecli_environment(environ: Mapping[str, str] | None = None) -> dict[str, str]:
    """Copy the caller environment and disable OfficeCLI's update checks."""

    result = dict(os.environ if environ is None else environ)
    result[SKIP_UPDATE_ENV] = "1"
    return result


def require_safe_officecli_argv(argv: Sequence[str]) -> None:
    if not argv or not all(isinstance(item, str) and item for item in argv):
        raise OfficeCLIAdapterError("INVALID_ARGV", "OfficeCLI commands must be non-empty argv string lists")
    lowered = [item.lower() for item in argv[1:]]
    joined = " ".join(lowered)
    forbidden = (
        "load_skill",
        "load-skill",
        "skills install",
        "skill install",
        "officecli install",
        " mcp",
    )
    if any(item in joined for item in forbidden) or (lowered and lowered[0] in {"install", "mcp", "skills"}):
        raise OfficeCLIAdapterError("FORBIDDEN_OFFICECLI_COMMAND", f"Forbidden OfficeCLI command family: {joined}")


def officecli_help_argv(binary: str, family: str, *, version: str = PINNED_VERSION) -> list[str]:
    table = COMMAND_TABLES.get(version)
    if table is None or family not in table:
        raise OfficeCLIAdapterError("OFFICECLI_COMMAND_UNSUPPORTED", f"No command table for OfficeCLI {version} family {family}")
    return [binary, *table[family], "--help"]


def officecli_command_argv(
    binary: str,
    family: str,
    document: str,
    *,
    version: str = PINNED_VERSION,
    output: str | None = None,
    slide: int | None = None,
    contact_sheet: bool = False,
    batch_input: str | None = None,
) -> list[str]:
    table = COMMAND_TABLES.get(version)
    if table is None or family not in {"validate", "issues", "outline", "text", "screenshot", "batch"}:
        raise OfficeCLIAdapterError("OFFICECLI_COMMAND_UNSUPPORTED", f"No command table for OfficeCLI {version} family {family}")
    if family == "validate":
        return [binary, *table["validate"], document, "--json"]
    if family in {"issues", "outline", "text"}:
        return [binary, *table["view"], document, family, "--json"]
    if family == "batch":
        if not batch_input:
            raise OfficeCLIAdapterError("OFFICECLI_COMMAND_INVALID", "batch requires a batch input path")
        return [binary, *table["batch"], document, "--input", batch_input]
    if not output:
        raise OfficeCLIAdapterError("OFFICECLI_COMMAND_INVALID", "screenshot requires an output path")
    argv = [binary, *table["screenshot"], document]
    if contact_sheet:
        argv.append("--contact-sheet")
    if slide is not None:
        argv.extend(["--slide", str(slide)])
    argv.extend(["--output", output])
    return argv


def run_officecli(
    argv: Sequence[str],
    *,
    timeout: int = 30,
    environ: Mapping[str, str] | None = None,
    cwd: str | os.PathLike[str] | None = None,
) -> subprocess.CompletedProcess[str]:
    """Run one validated argv without a shell and with auto-update disabled."""

    require_safe_officecli_argv(argv)
    return subprocess.run(
        list(argv),
        cwd=cwd,
        env=officecli_environment(environ),
        shell=False,
        check=False,
        capture_output=True,
        text=True,
        timeout=timeout,
    )


def require_pinned_officecli(
    *,
    home: str | os.PathLike[str] | None = None,
    target: str | os.PathLike[str] | None = None,
    environ: Mapping[str, str] | None = None,
    platform_name: str | None = None,
    timeout: int = 30,
) -> dict[str, Any]:
    """Resolve the managed/explicit binary and fail closed on unconfirmed version drift."""
    resolution = resolve_officecli_bin(
        home=home,
        target=target,
        environ=environ,
        platform_name=platform_name,
    )
    if not resolution["present"]:
        error = resolution.get("error") or {}
        raise OfficeCLIAdapterError(error.get("code", "OFFICECLI_NOT_PRESENT"), error.get("message", "OfficeCLI is not present"))
    binary = str(resolution["path"])
    try:
        completed = run_officecli([binary, "--version"], timeout=timeout, environ=environ)
    except (OSError, subprocess.TimeoutExpired) as error:
        raise OfficeCLIAdapterError("VERSION_PROBE_FAILED", f"OfficeCLI version probe failed: {error}") from error
    version = parse_version(completed.stdout + "\n" + completed.stderr) if completed.returncode == 0 else None
    if version != PINNED_VERSION:
        raise OfficeCLIAdapterError(
            "OFFICECLI_VERSION_DRIFT",
            f"Expected OfficeCLI {PINNED_VERSION}, found {version or 'unparseable'}; run rose-aili install or update without --skip-officecli and revalidate command capabilities before changing the pin",
        )
    return {**resolution, "version": version, "version_returncode": completed.returncode}


def parse_version(output: str) -> str | None:
    match = re.search(r"(?<!\d)(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)(?!\d)", output)
    return match.group(1) if match else None


def probe_officecli(
    *,
    home: str | os.PathLike[str] | None = None,
    target: str | os.PathLike[str] | None = None,
    environ: Mapping[str, str] | None = None,
    platform_name: str | None = None,
    timeout: int = 30,
) -> dict[str, Any]:
    """Run only --version and installed-help capability queries."""

    resolution = resolve_officecli_bin(
        home=home,
        target=target,
        environ=environ,
        platform_name=platform_name,
    )
    result: dict[str, Any] = {
        "schema_version": 1,
        "present": resolution["present"],
        "path": resolution["path"],
        "path_source": resolution["source"],
        "managed_target": resolution["managed_target"],
        "expected_version": PINNED_VERSION,
        "version": None,
        "version_drift": None,
        "platform": _platform_name(platform_name),
        "environment": {SKIP_UPDATE_ENV: "1"},
        "capabilities": {
            "read": False,
            "validate": False,
            "render": False,
            "batch": False,
            "save": False,
        },
        "queries": [],
        "errors": [],
    }
    if not resolution["present"]:
        if resolution.get("error"):
            result["errors"].append(resolution["error"])
        return result

    binary = str(resolution["path"])
    queries = [("version", [binary, "--version"])] + [
        ("help:" + family, officecli_help_argv(binary, family)) for family in PROBE_HELP_FAMILIES
    ]
    query_success: dict[str, bool] = {}
    for name, argv in queries:
        try:
            completed = run_officecli(argv, timeout=timeout, environ=environ)
            entry = {
                "name": name,
                "argv": argv,
                "returncode": completed.returncode,
                "stdout": completed.stdout[:4096],
                "stderr": completed.stderr[:4096],
            }
            result["queries"].append(entry)
            query_success[name] = completed.returncode == 0
            if name == "version" and completed.returncode == 0:
                result["version"] = parse_version(completed.stdout + "\n" + completed.stderr)
        except (OSError, subprocess.TimeoutExpired) as exc:
            result["queries"].append({"name": name, "argv": argv, "error": str(exc)})
            result["errors"].append({"code": "PROBE_QUERY_FAILED", "message": f"{name}: {exc}"})
            query_success[name] = False

    version = result["version"]
    result["version_drift"] = version != PINNED_VERSION if version is not None else True
    result["capabilities"] = {
        "read": query_success.get("help:view", False),
        "validate": query_success.get("help:validate", False),
        "render": query_success.get("help:screenshot", False),
        "batch": query_success.get("help:batch", False),
        "save": False,
    }
    if version is None:
        result["errors"].append({"code": "VERSION_UNPARSEABLE", "message": "--version did not report a semantic version"})
    return result


def print_json(value: Any) -> None:
    print(json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False))
