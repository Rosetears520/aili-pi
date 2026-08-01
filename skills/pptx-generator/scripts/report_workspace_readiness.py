#!/usr/bin/env python3
"""Compute PPTX workspace readiness from current files and fingerprints."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from compile_plan import build_outline
from report_font_audit import evaluate_font_audit
from workspace_core import (
    SCHEMA_VERSION,
    SUPPORTED_PROFILES,
    WorkspaceError,
    blocker,
    canonical_json_bytes,
    contained_path,
    load_json,
    read_normalized_markdown,
    renderer_fingerprint,
    select_next_action,
    sha256_bytes,
    sha256_file,
    source_fingerprint,
    write_json_atomic,
)


def _safe_json(root: Path, relative: str, blockers: list[dict[str, Any]], *, required: bool = True) -> Any:
    try:
        path = contained_path(root, relative)
    except WorkspaceError as error:
        blockers.append(blocker(error.code, error.message, path=error.path, next_action="repair-workspace"))
        return None
    if not path.is_file():
        if required:
            blockers.append(blocker("REQUIRED_SOURCE_MISSING", "Required authored source is missing", path=relative, next_action="author-source"))
        return None
    try:
        return load_json(path)
    except WorkspaceError as error:
        blockers.append(blocker(error.code, error.message, path=relative, next_action="repair-source"))
        return None


def _source_manifest_checks(root: Path, profile: str, blockers: list[dict[str, Any]]) -> None:
    manifest = _safe_json(root, "sources/manifest.json", blockers)
    if not isinstance(manifest, dict):
        return
    entries = manifest.get("sources")
    if not isinstance(entries, list):
        blockers.append(blocker("SOURCE_MANIFEST_INVALID", "sources must be an array", path="sources/manifest.json", next_action="repair-source"))
        return
    if profile in {"template-edit", "inspect"} and not any(isinstance(item, dict) and item.get("required") for item in entries):
        blockers.append(
            blocker(
                "REQUIRED_SOURCE_MISSING",
                "This profile requires a controlling or inspected source entry",
                path="sources/manifest.json",
                next_action="provide-source",
            )
        )
    for item in entries:
        if not isinstance(item, dict):
            blockers.append(blocker("SOURCE_MANIFEST_INVALID", "Source entry must be an object", path="sources/manifest.json", next_action="repair-source"))
            continue
        relative = item.get("path")
        required = item.get("required") is True
        if not relative:
            if required:
                blockers.append(blocker("REQUIRED_SOURCE_MISSING", "Required source path is empty", path="sources/manifest.json", next_action="provide-source"))
            continue
        try:
            source = contained_path(root, relative)
        except WorkspaceError as error:
            blockers.append(blocker(error.code, error.message, path=error.path, next_action="repair-source"))
            continue
        if not source.is_file():
            if required:
                blockers.append(blocker("REQUIRED_SOURCE_MISSING", "Required source file is absent", path=relative, next_action="provide-source"))
            continue
        declared_hash = item.get("sha256")
        if declared_hash and declared_hash != sha256_file(source):
            blockers.append(blocker("SOURCE_HASH_MISMATCH", "Source hash does not match the current file", path=relative, next_action="refresh-source-manifest"))


def _configured_path_checks(root: Path, workspace: dict[str, Any], blockers: list[dict[str, Any]]) -> None:
    paths = workspace.get("paths", {})
    if not isinstance(paths, dict):
        blockers.append(blocker("WORKSPACE_PATHS_INVALID", "workspace paths must be an object", path="workspace.json", next_action="repair-workspace"))
        return
    for name, relative in paths.items():
        try:
            contained_path(root, relative)
        except WorkspaceError as error:
            blockers.append(
                blocker(
                    error.code,
                    f"Configured path {name!r} is invalid: {error.message}",
                    path=error.path,
                    next_action="repair-workspace",
                )
            )


def _full_source_checks(root: Path, blockers: list[dict[str, Any]]) -> None:
    for relative in (
        "design-brief.json",
        "design-contract.json",
        "evidence-plan.json",
        "asset-plan.json",
        "assets/manifest.json",
        "font-environment.json",
    ):
        _safe_json(root, relative, blockers)

    manifest = _safe_json(root, "assets/manifest.json", [], required=False)
    if not isinstance(manifest, dict):
        return
    assets = manifest.get("assets", [])
    if not isinstance(assets, list):
        blockers.append(blocker("ASSET_MANIFEST_INVALID", "assets must be an array", path="assets/manifest.json", next_action="repair-assets"))
        return
    for item in assets:
        if not isinstance(item, dict) or not isinstance(item.get("path"), str):
            blockers.append(blocker("ASSET_MANIFEST_INVALID", "Asset entry needs a contained path", path="assets/manifest.json", next_action="repair-assets"))
            continue
        try:
            path = contained_path(root, item["path"])
        except WorkspaceError as error:
            blockers.append(blocker(error.code, error.message, path=error.path, next_action="repair-assets"))
            continue
        if not path.is_file():
            blockers.append(blocker("ASSET_MISSING", "Manifest asset file is missing", path=item["path"], next_action="prepare-assets"))
        elif item.get("sha256") and item["sha256"] != sha256_file(path):
            blockers.append(blocker("ASSET_HASH_MISMATCH", "Manifest asset hash does not match the current file", path=item["path"], next_action="refresh-assets"))


def _open_blocker_checks(root: Path, blockers: list[dict[str, Any]]) -> None:
    intake = _safe_json(root, "intake.json", blockers)
    if not isinstance(intake, dict):
        return
    entries = intake.get("blockers", [])
    if not isinstance(entries, list):
        blockers.append(blocker("INTAKE_INVALID", "intake blockers must be an array", path="intake.json", next_action="repair-intake"))
        return
    for item in entries:
        if not isinstance(item, dict):
            blockers.append(blocker("INTAKE_INVALID", "intake blocker must be an object", path="intake.json", next_action="repair-intake"))
            continue
        if item.get("status") == "open":
            severity = "hard" if item.get("severity") == "hard" else "attention"
            blockers.append(
                blocker(
                    "OPEN_INTAKE_BLOCKER",
                    item.get("description") or "An intake blocker remains open",
                    severity=severity,
                    path="intake.json",
                    next_action=item.get("next_action") or "need-user",
                )
            )


def _font_checks(root: Path, blockers: list[dict[str, Any]], unverified: list[dict[str, str]]) -> dict[str, Any] | None:
    contract = _safe_json(root, "font-contract.json", blockers)
    environment = _safe_json(root, "font-environment.json", blockers)
    if not isinstance(contract, dict) or not isinstance(environment, dict):
        return None
    external_reads = environment.get("external_reads", {})
    if isinstance(external_reads, dict) and external_reads.get("approval_state") == "required" and external_reads.get("requested_paths"):
        blockers.append(
            blocker(
                "FONT_EXTERNAL_READ_APPROVAL_REQUIRED",
                "Font inventory requires exact approval for external paths: " + ", ".join(external_reads.get("requested_paths", [])),
                path="font-environment.json",
                next_action="need-user",
            )
        )
    try:
        audit = evaluate_font_audit(root)
    except WorkspaceError as error:
        blockers.append(blocker(error.code, error.message, path="font-contract.json", next_action="repair-font-contract"))
        return None
    for environment_name in ("build", "render"):
        observed = audit.get("environments", {}).get(environment_name, {})
        missing = observed.get("required_missing", []) if isinstance(observed, dict) else []
        unapproved = observed.get("unapproved_substitutions", []) if isinstance(observed, dict) else []
        if missing:
            blockers.append(
                blocker(
                    "REQUIRED_FONT_UNAVAILABLE",
                    f"Required fonts are unavailable in {environment_name}: {', '.join(missing)}",
                    path="font-environment.json",
                    next_action="need-user",
                )
            )
        if unapproved:
            blockers.append(
                blocker(
                    "UNAPPROVED_FONT_SUBSTITUTION",
                    f"Unapproved font substitutions were observed in {environment_name}: {', '.join(unapproved)}",
                    path="font-environment.json",
                    next_action="need-user",
                )
            )
    target = audit.get("environments", {}).get("target", {})
    if not isinstance(target, dict) or target.get("status") != "verified":
        unverified.append({"code": "TARGET_FONT_UNVERIFIED", "message": "Final presentation environment font availability is Unverified"})
    return audit


def _template_checks(root: Path, blockers: list[dict[str, Any]]) -> dict[str, Any] | None:
    intake = _safe_json(root, "intake.json", blockers)
    manifest = _safe_json(root, "sources/manifest.json", blockers)
    profile = _safe_json(root, "template-profile.json", blockers)
    if not isinstance(intake, dict) or not isinstance(manifest, dict) or not isinstance(profile, dict):
        return None
    references = intake.get("visual_references")
    if not isinstance(references, list):
        blockers.append(blocker("REFERENCE_ROLE_INVALID", "visual_references must be an array", path="intake.json", next_action="repair-intake"))
        return profile
    controlling = [item for item in references if isinstance(item, dict) and item.get("role") == "controlling-template"]
    if len(controlling) != 1:
        blockers.append(blocker("CONTROLLING_TEMPLATE_AMBIGUOUS", "Template edit requires exactly one controlling template", path="intake.json", next_action="need-user"))
        return profile
    reference = controlling[0]
    if reference.get("user_decision") != "confirmed" or not reference.get("allowed_uses") or reference.get("fidelity_mode") in {None, "none"}:
        blockers.append(blocker("REFERENCE_PERMISSION_UNRESOLVED", "Controlling template role, allowed uses, and fidelity require a confirmed user decision", path="intake.json", next_action="need-user"))
    sources = manifest.get("sources", [])
    source_entries = [item for item in sources if isinstance(item, dict) and item.get("role") == "controlling-template"] if isinstance(sources, list) else []
    if len(source_entries) != 1:
        blockers.append(blocker("CONTROLLING_TEMPLATE_AMBIGUOUS", "Source manifest requires exactly one controlling template", path="sources/manifest.json", next_action="repair-source"))
        return profile
    source = source_entries[0]
    relative = source.get("path")
    if not isinstance(relative, str) or not relative:
        blockers.append(blocker("REQUIRED_SOURCE_MISSING", "Controlling template path is empty", path="sources/manifest.json", next_action="provide-source"))
        return profile
    try:
        source_path = contained_path(root, relative, must_exist=True)
    except WorkspaceError as error:
        blockers.append(blocker(error.code, error.message, path=relative, next_action="provide-source"))
        return profile
    current_hash = sha256_file(source_path)
    if (
        source.get("sha256") != current_hash
        or reference.get("sha256") != current_hash
        or reference.get("path") != relative
        or source.get("allowed_uses") != reference.get("allowed_uses")
        or source.get("fidelity_mode") != reference.get("fidelity_mode")
        or source.get("user_decision") != reference.get("user_decision")
    ):
        blockers.append(blocker("REFERENCE_HASH_MISMATCH", "Intake/source reference is not bound to the current controlling template", path=relative, next_action="refresh-template-reference"))
    profile_source = profile.get("source")
    if profile.get("status") != "profiled" or not isinstance(profile_source, dict) or profile_source.get("sha256") != current_hash:
        blockers.append(blocker("TEMPLATE_PROFILE_MISSING_OR_STALE", "Template profile must be current for the controlling template hash", path="template-profile.json", next_action="profile-template"))
    else:
        contract = _safe_json(root, "font-contract.json", blockers)
        summary = profile.get("typography_summary", {})
        family_rows = summary.get("families", []) if isinstance(summary, dict) else []
        template_families = {item.get("family") for item in family_rows if isinstance(item, dict) and isinstance(item.get("family"), str) and item.get("family")}
        contract_fonts = contract.get("fonts", []) if isinstance(contract, dict) else []
        contracted = {item.get("family") for item in contract_fonts if isinstance(item, dict) and isinstance(item.get("family"), str)} if isinstance(contract_fonts, list) else set()
        missing_families = sorted(template_families - contracted)
        if missing_families:
            blockers.append(blocker("TEMPLATE_FONT_CONTRACT_INCOMPLETE", "Template fonts are missing from the intent contract: " + ", ".join(missing_families), path="font-contract.json", next_action="author-font-contract"))
    return profile


def _outline_checks(root: Path, workspace: dict[str, Any], blockers: list[dict[str, Any]]) -> dict[str, Any] | None:
    paths = workspace.get("paths", {})
    plan_relative = paths.get("plan", "per-slide-content-plan.md") if isinstance(paths, dict) else "per-slide-content-plan.md"
    outline_relative = paths.get("outline", "outline.json") if isinstance(paths, dict) else "outline.json"
    try:
        plan = contained_path(root, plan_relative)
        outline_path = contained_path(root, outline_relative)
    except WorkspaceError as error:
        blockers.append(blocker(error.code, error.message, path=error.path, next_action="repair-workspace"))
        return None
    if not plan.is_file():
        blockers.append(blocker("SOURCE_PLAN_MISSING", "Canonical per-slide Markdown plan is missing", path=plan_relative, next_action="author-plan"))
        return None
    try:
        text, normalized = read_normalized_markdown(plan)
    except UnicodeDecodeError as error:
        blockers.append(blocker("INVALID_UTF8", str(error), path=plan_relative, next_action="repair-plan"))
        return None
    expected, diagnostics = build_outline(text, normalized, plan_relative)
    if expected is None:
        blockers.append(
            blocker(
                "PLAN_INVALID",
                "Canonical plan cannot be compiled: " + ", ".join(item["code"] for item in diagnostics),
                path=plan_relative,
                next_action="repair-plan",
            )
        )
        return None
    if not outline_path.is_file():
        blockers.append(blocker("OUTLINE_MISSING", "Generated outline is missing", severity="attention", path=outline_relative, next_action="compile-plan"))
        return expected
    try:
        actual = load_json(outline_path)
    except WorkspaceError:
        actual = None
    if actual != expected:
        blockers.append(
            blocker(
                "STALE_OR_MUTATED_OUTLINE",
                "Generated outline does not exactly match the current canonical plan",
                path=outline_relative,
                next_action="compile-plan",
            )
        )
    return expected


def evaluate_workspace(workspace_root: Path) -> dict[str, Any]:
    root = workspace_root.resolve()
    blockers: list[dict[str, Any]] = []
    unverified: list[dict[str, str]] = []
    try:
        workspace = load_json(root / "workspace.json")
    except WorkspaceError as error:
        blockers.append(blocker(error.code, error.message, path=error.path, next_action="initialize-workspace"))
        workspace = {}
    profile = workspace.get("profile") if isinstance(workspace, dict) else None
    if profile not in SUPPORTED_PROFILES:
        blockers.append(blocker("PROFILE_UNSUPPORTED", "Workspace profile is unsupported", path=str(profile), next_action="repair-workspace"))

    if isinstance(workspace, dict):
        _configured_path_checks(root, workspace, blockers)
    _source_manifest_checks(root, profile, blockers)
    expected_outline: dict[str, Any] | None = None
    renderer_hash: dict[str, Any] | None = None
    font_audit: dict[str, Any] | None = None
    template_profile: dict[str, Any] | None = None
    if profile in {"from-scratch", "template-edit"}:
        _full_source_checks(root, blockers)
        _open_blocker_checks(root, blockers)
        if profile == "template-edit":
            template_profile = _template_checks(root, blockers)
        font_audit = _font_checks(root, blockers, unverified)
        expected_outline = _outline_checks(root, workspace, blockers)
        try:
            renderer_hash = renderer_fingerprint(root, workspace)
        except WorkspaceError as error:
            blockers.append(blocker(error.code, error.message, path=error.path, next_action="repair-renderer"))

    try:
        source_hash = source_fingerprint(root, workspace) if isinstance(workspace, dict) else None
    except WorkspaceError as error:
        blockers.append(blocker(error.code, error.message, path=error.path, next_action="repair-workspace"))
        source_hash = None

    hard = [item for item in blockers if item["severity"] == "hard"]
    status = "blocked" if hard else "needs_attention" if blockers else "ready"
    result: dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "report_kind": "workspace-readiness",
        "status": status,
        "profile": profile,
        "blockers": blockers,
        "unverified": unverified,
        "next_action": select_next_action(blockers, "build-or-inspect"),
    }
    if source_hash is not None:
        result["source_fingerprint"] = source_hash["sha256"]
        result["source_files"] = source_hash["files"]
    if renderer_hash is not None:
        result["renderer_source_sha256"] = renderer_hash["sha256"]
        result["renderer_files"] = renderer_hash["files"]
    if expected_outline is not None:
        result["expected_outline_sha256"] = sha256_bytes(canonical_json_bytes(expected_outline))
        result["source_plan_sha256"] = expected_outline["source_plan_sha256"]
        result["slide_ids"] = [slide["id"] for slide in expected_outline["slides"]]
    if font_audit is not None:
        result["font_audit"] = font_audit
    if template_profile is not None:
        result["template_profile_sha256"] = sha256_file(contained_path(root, "template-profile.json", must_exist=True))
    if profile in {"from-scratch", "template-edit"} and contained_path(root, "font-environment.json").is_file():
        result["font_environment_sha256"] = sha256_file(contained_path(root, "font-environment.json", must_exist=True))
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workspace", help="Workspace root")
    parser.add_argument("--output", help="Workspace-relative report path (default: build/workspace-readiness.json)")
    args = parser.parse_args(argv)
    root = Path(args.workspace).resolve()
    result = evaluate_workspace(root)
    output = args.output or "build/workspace-readiness.json"
    try:
        output_path = contained_path(root, output)
        write_json_atomic(output_path, result)
        if result.get("profile") in {"from-scratch", "template-edit"} and isinstance(result.get("font_audit"), dict):
            workspace = load_json(root / "workspace.json")
            paths = workspace.get("paths", {}) if isinstance(workspace, dict) and isinstance(workspace.get("paths"), dict) else {}
            font_output = paths.get("font_audit", "build/font-audit.json")
            write_json_atomic(contained_path(root, font_output), result["font_audit"])
        result["output_path"] = output
    except WorkspaceError as error:
        result["status"] = "blocked"
        result["blockers"].append(blocker(error.code, error.message, path=error.path, next_action="repair-workspace"))
        result["next_action"] = select_next_action(result["blockers"], "repair-workspace")
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if result["status"] == "ready" else 2


if __name__ == "__main__":
    sys.exit(main())
