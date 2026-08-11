#!/usr/bin/env python3
"""Fail-closed delivery gate for the current plan-to-visual-review hash chain."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from report_workspace_readiness import evaluate_workspace
from workspace_core import (
    SCHEMA_VERSION,
    WorkspaceError,
    blocker,
    canonical_json_bytes,
    contained_path,
    load_json,
    select_next_action,
    sha256_bytes,
    sha256_file,
    validate_template_style_confirmation,
    write_json_atomic,
)


def _load_evidence(root: Path, relative: str, blockers: list[dict[str, Any]], missing_code: str, next_action: str) -> Any:
    try:
        path = contained_path(root, relative)
    except WorkspaceError as error:
        blockers.append(blocker(error.code, error.message, path=error.path, next_action=next_action))
        return None
    if not path.is_file():
        blockers.append(blocker(missing_code, "Required delivery evidence is missing", path=relative, next_action=next_action))
        return None
    try:
        return load_json(path)
    except WorkspaceError as error:
        blockers.append(blocker(error.code, error.message, path=relative, next_action=next_action))
        return None


def _verified_file(root: Path, record: Any, blockers: list[dict[str, Any]], *, code: str, next_action: str) -> Path | None:
    if not isinstance(record, dict) or not isinstance(record.get("path"), str) or not isinstance(record.get("sha256"), str):
        blockers.append(blocker(code, "Evidence file record requires path and sha256", next_action=next_action))
        return None
    try:
        path = contained_path(root, record["path"])
    except WorkspaceError as error:
        blockers.append(blocker(error.code, error.message, path=error.path, next_action=next_action))
        return None
    if not path.is_file():
        blockers.append(blocker(code, "Evidence file is missing", path=record["path"], next_action=next_action))
        return None
    if sha256_file(path) != record["sha256"]:
        blockers.append(blocker(code, "Evidence file hash is stale or mutated", path=record["path"], next_action=next_action))
        return None
    return path


def _render_hash(root: Path, render: dict[str, Any], blockers: list[dict[str, Any]]) -> str | None:
    artifacts = render.get("artifacts")
    if not isinstance(artifacts, list) or not artifacts:
        blockers.append(blocker("RENDER_EVIDENCE_INCOMPLETE", "Render manifest needs per-slide artifacts", next_action="render-deck"))
        return None
    hashed: list[dict[str, str]] = []
    valid_artifact_count = 0
    for item in artifacts:
        path = _verified_file(root, item, blockers, code="STALE_RENDER", next_action="render-deck")
        if path is None or not isinstance(item, dict) or not isinstance(item.get("slide_id"), str):
            if isinstance(item, dict) and not isinstance(item.get("slide_id"), str):
                blockers.append(blocker("RENDER_EVIDENCE_INCOMPLETE", "Render artifact needs a slide_id", next_action="render-deck"))
            continue
        hashed.append({"slide_id": item["slide_id"], "path": item["path"], "sha256": item["sha256"]})
        valid_artifact_count += 1
    contact = render.get("contact_sheet")
    if contact is None:
        blockers.append(blocker("RENDER_EVIDENCE_INCOMPLETE", "Render manifest needs a contact sheet", next_action="render-deck"))
        return None
    path = _verified_file(root, contact, blockers, code="STALE_RENDER", next_action="render-deck")
    if path is None:
        return None
    hashed.append({"slide_id": "_contact-sheet", "path": contact["path"], "sha256": contact["sha256"]})
    if valid_artifact_count != len(artifacts):
        return None
    return sha256_bytes(canonical_json_bytes(hashed))


def evaluate_delivery(workspace_root: Path) -> dict[str, Any]:
    root = workspace_root.resolve()
    workspace_report = evaluate_workspace(root)
    blockers: list[dict[str, Any]] = []
    if workspace_report["status"] != "ready":
        blockers.append(
            blocker(
                "WORKSPACE_NOT_READY",
                "Workspace readiness must be ready before delivery",
                next_action=workspace_report.get("next_action", {}).get("type", "repair-workspace"),
            )
        )
        blockers.extend(workspace_report.get("blockers", []))

    try:
        workspace = load_json(root / "workspace.json")
    except WorkspaceError:
        workspace = {}
    paths = workspace.get("paths", {}) if isinstance(workspace, dict) else {}
    outline_relative = paths.get("outline", "outline.json") if isinstance(paths, dict) else "outline.json"
    try:
        outline_path = contained_path(root, outline_relative)
        outline_sha = sha256_file(outline_path) if outline_path.is_file() else None
    except WorkspaceError as error:
        blockers.append(blocker(error.code, error.message, path=error.path, next_action="compile-plan"))
        outline_sha = None

    build_relative = paths.get("build_report", "build/build-report.json") if isinstance(paths, dict) else "build/build-report.json"
    render_relative = paths.get("render_manifest", "renders/final/manifest.json") if isinstance(paths, dict) else "renders/final/manifest.json"
    review_relative = paths.get("visual_review", "reviews/visual-review-final.json") if isinstance(paths, dict) else "reviews/visual-review-final.json"
    build = _load_evidence(root, build_relative, blockers, "BUILD_REPORT_MISSING", "build-deck")
    final_pptx: Path | None = None
    final_pptx_sha: str | None = None
    if isinstance(build, dict):
        expected_links = {
            "source_plan_sha256": workspace_report.get("source_plan_sha256"),
            "outline_sha256": outline_sha,
            "source_fingerprint": workspace_report.get("source_fingerprint"),
            "renderer_source_sha256": workspace_report.get("renderer_source_sha256"),
        }
        stale = [key for key, value in expected_links.items() if not value or build.get(key) != value]
        if build.get("status") != "succeeded" or stale:
            blockers.append(
                blocker(
                    "STALE_BUILD",
                    "Build report is not successful/current for: " + ", ".join(stale or ["status"]),
                    path=build_relative,
                    next_action="build-deck",
                )
            )
        final_pptx = _verified_file(root, build.get("final_pptx"), blockers, code="STALE_FINAL_PPTX", next_action="build-deck")
        if final_pptx is not None:
            final_pptx_sha = sha256_file(final_pptx)
        validation = build.get("validation")
        if not isinstance(validation, dict) or validation.get("status") != "passed" or validation.get("pptx_sha256") != final_pptx_sha:
            blockers.append(
                blocker(
                    "PACKAGE_VALIDATION_NOT_CURRENT",
                    "Strict package validation must pass for the current final PPTX hash",
                    path=build_relative,
                    next_action="validate-package",
                )
            )
        elif "path" in validation or "report_sha256" in validation:
            validation_record = {"path": validation.get("path"), "sha256": validation.get("report_sha256")}
            _verified_file(
                root,
                validation_record,
                blockers,
                code="PACKAGE_VALIDATION_NOT_CURRENT",
                next_action="validate-package",
            )
        autofit = build.get("autofit")
        if not isinstance(autofit, dict) or autofit.get("pptx_sha256") != final_pptx_sha:
            blockers.append(blocker("AUTOFIT_EVIDENCE_NOT_CURRENT", "Build report lacks current AutoFit evidence", path=build_relative, next_action="apply-autofit"))
        else:
            _verified_file(
                root,
                {"path": autofit.get("evidence_path"), "sha256": autofit.get("evidence_sha256")},
                blockers,
                code="AUTOFIT_EVIDENCE_NOT_CURRENT",
                next_action="apply-autofit",
            )

    render = _load_evidence(root, render_relative, blockers, "RENDER_MANIFEST_MISSING", "render-deck")
    render_sha: str | None = None
    expected_slide_ids = workspace_report.get("slide_ids", [])
    if isinstance(render, dict):
        if not final_pptx_sha or render.get("pptx_sha256") != final_pptx_sha:
            blockers.append(blocker("STALE_RENDER", "Render is not bound to the current final PPTX", path=render_relative, next_action="render-deck"))
        if render.get("slide_ids") != expected_slide_ids:
            blockers.append(blocker("STALE_RENDER", "Render slide IDs do not match the current outline", path=render_relative, next_action="render-deck"))
        artifact_slide_ids = [
            item.get("slide_id") for item in render.get("artifacts", []) if isinstance(item, dict)
        ] if isinstance(render.get("artifacts"), list) else []
        if artifact_slide_ids != expected_slide_ids:
            blockers.append(blocker("STALE_RENDER", "Per-slide render artifacts do not exactly cover current slide IDs", path=render_relative, next_action="render-deck"))
        render_sha = _render_hash(root, render, blockers)
        if not render_sha or render.get("render_sha256") != render_sha:
            blockers.append(blocker("STALE_RENDER", "Render aggregate hash is stale or invalid", path=render_relative, next_action="render-deck"))
        issue_scan = render.get("issue_scan")
        issue_path = _verified_file(root, issue_scan, blockers, code="OFFICECLI_ISSUES_NOT_CURRENT", next_action="scan-issues")
        if not isinstance(issue_scan, dict) or issue_scan.get("pptx_sha256") != final_pptx_sha:
            blockers.append(blocker("OFFICECLI_ISSUES_NOT_CURRENT", "OfficeCLI issue evidence is not bound to the current final PPTX", path=render_relative, next_action="scan-issues"))
        elif issue_path is not None:
            issue_report = load_json(issue_path)
            if not isinstance(issue_report, dict) or issue_report.get("pptx_sha256") != final_pptx_sha:
                blockers.append(blocker("OFFICECLI_ISSUES_NOT_CURRENT", "OfficeCLI issue report lacks the current final PPTX hash", path=issue_scan.get("path"), next_action="scan-issues"))

    review = _load_evidence(root, review_relative, blockers, "VISUAL_REVIEW_MISSING", "review-renders")
    if isinstance(review, dict):
        pages = review.get("pages")
        page_ids = [item.get("slide_id") for item in pages if isinstance(item, dict)] if isinstance(pages, list) else []
        pages_passing = (
            page_ids == expected_slide_ids
            and all(
                isinstance(item, dict)
                and item.get("inspection_status") == "inspected"
                and isinstance(item.get("observations"), list)
                and bool(item["observations"])
                and isinstance(item.get("checks"), dict)
                and len(item["checks"]) == 7
                and all(value in {"pass", "not-applicable"} for value in item["checks"].values())
                for item in pages or []
            )
        )
        stale_review = (
            not review.get("reviewer")
            or review.get("review_scope") != "final"
            or review.get("pptx_sha256") != final_pptx_sha
            or review.get("render_sha256") != render_sha
            or review.get("slide_ids") != expected_slide_ids
            or not isinstance(review.get("findings"), list)
            or not pages_passing
        )
        if stale_review:
            blockers.append(
                blocker(
                    "STALE_VISUAL_REVIEW",
                    "Visual review lacks a reviewer or exact current PPTX/render/slide-ID bindings",
                    path=review_relative,
                    next_action="review-renders",
                )
            )
        findings = review.get("findings") if isinstance(review.get("findings"), list) else []
        unresolved = [
            finding
            for finding in findings
            if (
                not isinstance(finding, dict)
                or finding.get("disposition") != "resolved"
                or finding.get("slide_id") not in expected_slide_ids
            )
        ]
        if review.get("disposition") != "pass" or unresolved:
            blockers.append(
                blocker(
                    "VISUAL_REVIEW_NOT_PASSING",
                    "Visual review disposition must pass and every finding must be resolved",
                    path=review_relative,
                    next_action="repair-and-review",
                )
            )

    preflight_relative = paths.get("layout_preflight", "build/layout-preflight.json") if isinstance(paths, dict) else "build/layout-preflight.json"
    preflight = _load_evidence(root, preflight_relative, blockers, "LAYOUT_PREFLIGHT_MISSING", "run-layout-preflight")
    if isinstance(preflight, dict):
        font_relative = paths.get("font_audit", "build/font-audit.json") if isinstance(paths, dict) else "build/font-audit.json"
        issues_relative = paths.get("officecli_issues", "build/officecli-issues.json") if isinstance(paths, dict) else "build/officecli-issues.json"
        expected_bindings = {
            "final_pptx_sha256": final_pptx_sha,
            "template_profile_sha256": workspace_report.get("template_profile_sha256"),
            "font_audit_sha256": sha256_file(contained_path(root, font_relative, must_exist=True)) if contained_path(root, font_relative).is_file() else None,
            "officecli_issues_sha256": sha256_file(contained_path(root, issues_relative, must_exist=True)) if contained_path(root, issues_relative).is_file() else None,
            "render_sha256": render_sha,
        }
        bindings = preflight.get("bindings", {}) if isinstance(preflight.get("bindings"), dict) else {}
        stale_keys = [key for key, value in expected_bindings.items() if bindings.get(key) != value]
        blocking_findings = [item for item in preflight.get("findings", []) if isinstance(item, dict) and item.get("status") == "blocking"] if isinstance(preflight.get("findings"), list) else ["invalid"]
        if preflight.get("status") != "ready" or stale_keys or blocking_findings:
            blockers.append(blocker("LAYOUT_PREFLIGHT_NOT_PASSING", "Layout preflight is blocked or stale for: " + ", ".join(stale_keys or ["findings/status"]), path=preflight_relative, next_action="repair-layout"))

    if isinstance(workspace, dict) and workspace.get("profile") == "template-edit":
        try:
            validate_template_style_confirmation(root, workspace)
        except WorkspaceError as error:
            blockers.append(blocker(error.code, error.message, path=error.path, next_action="confirm-template-style-proof"))

    status = "blocked" if blockers else "ready"
    result: dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "report_kind": "delivery-readiness",
        "status": status,
        "blockers": blockers,
        "unverified": workspace_report.get("unverified", []),
        "next_action": select_next_action(blockers, "deliver"),
        "chain": {
            "source_plan_sha256": workspace_report.get("source_plan_sha256"),
            "outline_sha256": outline_sha,
            "source_fingerprint": workspace_report.get("source_fingerprint"),
            "renderer_source_sha256": workspace_report.get("renderer_source_sha256"),
            "final_pptx_sha256": final_pptx_sha,
            "render_sha256": render_sha,
        },
    }
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workspace", help="Workspace root")
    parser.add_argument("--output", help="Workspace-relative report path (default: build/delivery-readiness.json)")
    args = parser.parse_args(argv)
    root = Path(args.workspace).resolve()
    result = evaluate_delivery(root)
    output = args.output or "build/delivery-readiness.json"
    try:
        output_path = contained_path(root, output)
        write_json_atomic(output_path, result)
        result["output_path"] = output
    except WorkspaceError as error:
        result["status"] = "blocked"
        result["blockers"].append(blocker(error.code, error.message, path=error.path, next_action="repair-workspace"))
        result["next_action"] = select_next_action(result["blockers"], "repair-workspace")
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if result["status"] == "ready" else 2


if __name__ == "__main__":
    sys.exit(main())
