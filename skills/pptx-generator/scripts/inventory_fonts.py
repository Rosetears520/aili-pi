#!/usr/bin/env python3
"""Build renderer-aware font evidence without silently reading external directories."""

from __future__ import annotations

import argparse
import json
import os
import platform
import sys
from pathlib import Path
from typing import Any, Iterable

from workspace_core import canonical_json_bytes, sha256_bytes, sha256_file, write_json_atomic


OBSERVATION_KINDS = {
    "renderer-query",
    "windows-system-registration",
    "windows-user-registration",
    "fontconfig",
    "mounted-files",
    "target-user",
}


def detect_wsl(environ: dict[str, str] | None = None, proc_version: str | None = None) -> bool:
    env = os.environ if environ is None else environ
    if env.get("WSL_DISTRO_NAME") or env.get("WSL_INTEROP"):
        return True
    if proc_version is None:
        try:
            proc_version = Path("/proc/version").read_text(encoding="utf-8", errors="ignore")
        except OSError:
            proc_version = ""
    return "microsoft" in proc_version.lower()


def default_external_candidates(platform_name: str, wsl: bool) -> list[str]:
    value = platform_name.lower()
    if value.startswith("win"):
        return [r"C:\Windows\Fonts", r"%LOCALAPPDATA%\Microsoft\Windows\Fonts"]
    if wsl:
        return ["/mnt/c/Windows/Fonts", "/mnt/c/Users/<user>/AppData/Local/Microsoft/Windows/Fonts"]
    return []


def _read_lines(path: Path) -> list[str]:
    text = path.read_text(encoding="utf-8-sig")
    stripped = text.strip()
    if not stripped:
        return []
    if stripped.startswith("["):
        value = json.loads(stripped)
        if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
            raise ValueError(f"Font evidence JSON must be a string array: {path}")
        return sorted(set(item.strip() for item in value if item.strip()))
    return sorted(set(line.strip() for line in text.splitlines() if line.strip()))


def _inside(root: Path, path: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


def inventory_font_environment(
    workspace_root: Path,
    *,
    platform_name: str,
    wsl: bool,
    renderers: dict[str, str],
    observations: Iterable[dict[str, str]],
    approved_paths: Iterable[str] = (),
    requested_paths: Iterable[str] | None = None,
) -> dict[str, Any]:
    root = workspace_root.resolve()
    approvals = {str(Path(item).expanduser().resolve()) for item in approved_paths}
    requested = sorted(set(requested_paths or default_external_candidates(platform_name, wsl)))
    environments = {
        name: {
            "status": "unverified",
            "renderer": renderers.get(name, "unresolved"),
            "visible_fonts": [],
            "registered_fonts": [],
            "mounted_font_files": [],
            "observed_substitutions": [],
            "evidence": [],
        }
        for name in ("build", "render", "target")
    }
    observed_paths: list[str] = []
    blocked_paths: list[str] = []
    visibility_seen: set[str] = set()
    for observation in observations:
        kind = observation.get("kind", "")
        environment = observation.get("environment", "")
        source_value = observation.get("path", "")
        if kind not in OBSERVATION_KINDS or environment not in environments or not source_value:
            raise ValueError("Each font observation needs a supported kind, build/render/target environment, and path")
        source = Path(source_value).expanduser().resolve()
        external = not _inside(root, source)
        if external and str(source) not in approvals:
            blocked_paths.append(str(source))
            continue
        if not source.exists():
            raise FileNotFoundError(source)
        observed_paths.append(str(source))
        values = sorted(path.name for path in source.iterdir() if path.is_file()) if source.is_dir() else _read_lines(source)
        target = environments[environment]
        if kind in {"renderer-query", "fontconfig", "target-user"}:
            target["visible_fonts"] = sorted(set(target["visible_fonts"]) | set(values))
            visibility_seen.add(environment)
        elif kind in {"windows-system-registration", "windows-user-registration"}:
            target["registered_fonts"] = sorted(set(target["registered_fonts"]) | set(values))
        elif kind == "mounted-files":
            target["mounted_font_files"] = sorted(set(target["mounted_font_files"]) | set(values))
        target["evidence"].append({"kind": kind, "path": str(source), "sha256": sha256_file(source) if source.is_file() else sha256_bytes(canonical_json_bytes(values))})
    for name, environment in environments.items():
        environment["evidence"] = sorted(environment["evidence"], key=lambda item: (item["kind"], item.get("path", "")))
        if name in visibility_seen:
            environment["status"] = "verified"
    approval_state = "required" if blocked_paths else "approved" if any(not _inside(root, Path(path)) for path in observed_paths) else "not-required"
    status = "need-user" if blocked_paths else "ready" if environments["build"]["status"] == environments["render"]["status"] == "verified" else "unverified"
    return {
        "schema_version": "1.0",
        "report_kind": "font-environment",
        "status": status,
        "platform": platform_name,
        "wsl": wsl,
        "external_reads": {
            "approval_state": approval_state,
            "requested_paths": sorted(set(requested + blocked_paths)),
            "observed_paths": sorted(set(observed_paths)),
        },
        "environments": environments,
    }


def _parse_observation(value: str) -> dict[str, str]:
    parts = value.split("=", 2)
    if len(parts) != 3:
        raise argparse.ArgumentTypeError("Observation must be KIND=ENVIRONMENT=PATH")
    return {"kind": parts[0], "environment": parts[1], "path": parts[2]}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workspace", help="PPTX workspace root")
    parser.add_argument("--output", default="font-environment.json")
    parser.add_argument("--platform", default=platform.system().lower())
    parser.add_argument("--wsl", action="store_true")
    parser.add_argument("--build-renderer", default="unresolved")
    parser.add_argument("--render-renderer", default="unresolved")
    parser.add_argument("--target-renderer", default="unresolved")
    parser.add_argument("--observe", action="append", type=_parse_observation, default=[])
    parser.add_argument("--approve-read", action="append", default=[])
    parser.add_argument("--request-path", action="append")
    args = parser.parse_args()
    root = Path(args.workspace).resolve()
    try:
        result = inventory_font_environment(
            root,
            platform_name=args.platform,
            wsl=args.wsl or detect_wsl(),
            renderers={"build": args.build_renderer, "render": args.render_renderer, "target": args.target_renderer},
            observations=args.observe,
            approved_paths=args.approve_read,
            requested_paths=args.request_path,
        )
        write_json_atomic(root / args.output, result)
        code = 0 if result["status"] in {"ready", "unverified"} else 2
    except (OSError, ValueError, json.JSONDecodeError) as error:
        result = {"status": "blocked", "error": {"code": "FONT_INVENTORY_BLOCKED", "message": str(error)}}
        code = 2
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    return code


if __name__ == "__main__":
    sys.exit(main())
