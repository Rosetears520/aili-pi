#!/usr/bin/env python3
"""Derive a hash-bound font audit from the current font contract evidence."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Sequence

from workspace_core import WorkspaceError, contained_path, load_json, sha256_file, write_json_atomic


def evaluate_font_contract(
    contract: Any,
    contract_sha256: str,
    environment: Any,
    environment_sha256: str,
    template_profile_sha256: str | None,
) -> dict[str, Any]:
    if not isinstance(contract, dict):
        raise WorkspaceError("FONT_CONTRACT_INVALID", "Font contract must contain an object")
    fonts = contract.get("fonts")
    environments = environment.get("environments") if isinstance(environment, dict) else None
    if not isinstance(fonts, list) or not isinstance(environments, dict):
        raise WorkspaceError("FONT_CONTRACT_INVALID", "Font contract and font environment need fonts/environments")
    if contract.get("template_profile_sha256") != template_profile_sha256:
        raise WorkspaceError("FONT_TEMPLATE_PROFILE_STALE", "Font contract is not bound to the current template profile")
    required: dict[str, list[str]] = {}
    approved_substitutions: set[str] = set()
    for item in fonts:
        if (
            not isinstance(item, dict)
            or not isinstance(item.get("family"), str)
            or not item["family"]
            or not isinstance(item.get("required"), bool)
            or not isinstance(item.get("fallback_allowed"), bool)
        ):
            raise WorkspaceError("FONT_CONTRACT_INVALID", "Every font needs a family and required boolean")
        if item["required"]:
            fallbacks = item.get("approved_fallbacks", []) if item.get("fallback_allowed") else []
            if not isinstance(fallbacks, list) or not all(isinstance(value, str) for value in fallbacks):
                raise WorkspaceError("FONT_CONTRACT_INVALID", "approved_fallbacks must be a string array")
            required[item["family"]] = fallbacks
            approved_substitutions.update(f"{item['family']}->{fallback}" for fallback in fallbacks)

    audits: dict[str, dict[str, Any]] = {}
    need_user = False
    any_unverified = False
    for name in ("build", "render", "target"):
        environment = environments.get(name)
        if not isinstance(environment, dict):
            raise WorkspaceError("FONT_CONTRACT_INVALID", f"Font environment {name} must contain an object")
        status = environment.get("status")
        available = environment.get("visible_fonts")
        substitutions = environment.get("observed_substitutions", [])
        if (
            status not in {"verified", "unverified"}
            or not isinstance(available, list)
            or not all(isinstance(item, str) for item in available)
            or not isinstance(substitutions, list)
            or not all(isinstance(item, str) for item in substitutions)
        ):
            raise WorkspaceError("FONT_CONTRACT_INVALID", f"Font environment {name} has an invalid evidence shape")
        visible = set(available)
        missing: list[str] = []
        fallbacks_used: list[str] = []
        if status == "verified":
            for family, fallbacks in required.items():
                if family in visible:
                    continue
                selected = next((fallback for fallback in fallbacks if fallback in visible), None)
                if selected:
                    fallbacks_used.append(f"{family}->{selected}")
                else:
                    missing.append(family)
        else:
            missing = sorted(required)
        unapproved = sorted(set(substitutions) - approved_substitutions)
        audits[name] = {
            "status": status,
            "renderer": environment.get("renderer", "unresolved"),
            "required_missing": missing,
            "approved_fallbacks_used": sorted(fallbacks_used),
            "observed_substitutions": sorted(substitutions),
            "unapproved_substitutions": unapproved,
        }
        if name in {"build", "render"} and (required and (status != "verified" or missing) or unapproved):
            need_user = True
        if status != "verified":
            any_unverified = True

    return {
        "schema_version": "1.0",
        "font_contract_sha256": contract_sha256,
        "font_environment_sha256": environment_sha256,
        "template_profile_sha256": template_profile_sha256,
        "status": "need-user" if need_user else "unverified" if any_unverified else "passed",
        "environments": audits,
    }


def evaluate_font_audit(workspace_root: Path) -> dict[str, Any]:
    root = workspace_root.resolve()
    workspace = load_json(root / "workspace.json")
    paths = workspace.get("paths", {}) if isinstance(workspace, dict) and isinstance(workspace.get("paths"), dict) else {}
    contract_relative = paths.get("font_contract", "font-contract.json")
    environment_relative = paths.get("font_environment", "font-environment.json")
    contract_path = contained_path(root, contract_relative, must_exist=True)
    environment_path = contained_path(root, environment_relative, must_exist=True)
    profile_hash: str | None = None
    if workspace.get("profile") == "template-edit":
        profile_relative = paths.get("template_profile", "template-profile.json")
        profile_path = contained_path(root, profile_relative, must_exist=True)
        profile_hash = sha256_file(profile_path)
    return evaluate_font_contract(
        load_json(contract_path),
        sha256_file(contract_path),
        load_json(environment_path),
        sha256_file(environment_path),
        profile_hash,
    )


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workspace", help="PPTX workspace root")
    parser.add_argument("--output", help="Workspace-relative output (default: build/font-audit.json)")
    args = parser.parse_args(argv)
    root = Path(args.workspace).resolve()
    try:
        workspace = load_json(root / "workspace.json")
        paths = workspace.get("paths", {}) if isinstance(workspace, dict) and isinstance(workspace.get("paths"), dict) else {}
        output = args.output or paths.get("font_audit", "build/font-audit.json")
        result = evaluate_font_audit(root)
        write_json_atomic(contained_path(root, output), result)
        result = {**result, "output_path": output}
        code = 0 if result["status"] in {"passed", "unverified"} else 2
    except (WorkspaceError, OSError, ValueError) as error:
        result = {"status": "blocked", "error": {"code": getattr(error, "code", "FONT_AUDIT_BLOCKED"), "message": str(error)}}
        code = 2
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    return code


if __name__ == "__main__":
    sys.exit(main())
