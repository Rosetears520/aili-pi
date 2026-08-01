#!/usr/bin/env python3
"""Evaluate post-AutoFit geometry, font, image, and OfficeCLI issue evidence."""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any

from workspace_core import WorkspaceError, contained_path, load_json, sha256_file, write_json_atomic


def _finding(code: str, message: str, *, shape: dict[str, Any] | None = None, issue_id: str | None = None, evidence: dict[str, Any] | None = None, status: str = "blocking") -> dict[str, Any]:
    value: dict[str, Any] = {"code": code, "status": status, "message": message}
    if shape:
        if shape.get("slide_id") is not None:
            value["slide_id"] = str(shape["slide_id"])
        if shape.get("shape_id") is not None:
            value["shape_id"] = str(shape["shape_id"])
    if issue_id is not None:
        value["issue_id"] = issue_id
    if evidence:
        value["evidence"] = evidence
    return value


def _issue_entries(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, list):
        return [item for item in value if isinstance(item, dict)]
    if not isinstance(value, dict):
        return []
    for key in ("issues", "findings", "items"):
        if isinstance(value.get(key), list):
            return [item for item in value[key] if isinstance(item, dict)]
    data = value.get("data")
    if data is not value:
        return _issue_entries(data)
    return []


BLOCKING_ISSUE_TYPES = {"overflow", "hidden-text", "hidden_text", "unresolved-placeholder", "unresolved_placeholder", "distortion", "severe-overlap", "severe_overlap", "font-substitution", "font_substitution", "unknown"}
NON_BLOCKING_ISSUE_TYPES = {"accessibility", "metadata", "informational", "minor-overlap", "minor_overlap"}


def _outside(bounds: dict[str, Any], slide_size: dict[str, Any]) -> bool:
    values = [bounds.get(key) for key in ("x", "y", "w", "h")]
    if not all(isinstance(item, (int, float)) for item in values):
        return False
    width = slide_size.get("w") or slide_size.get("cx")
    height = slide_size.get("h") or slide_size.get("cy")
    if not isinstance(width, (int, float)) or not isinstance(height, (int, float)):
        return False
    x, y, w, h = values
    return x < 0 or y < 0 or x + w > width or y + h > height


def evaluate_layout_preflight(
    *,
    final_pptx_sha256: str,
    template_profile_sha256: str | None,
    font_audit_sha256: str,
    issues_sha256: str,
    layout_evidence_sha256: str,
    layout_evidence: dict[str, Any],
    issues: Any,
    render_sha256: str | None = None,
) -> dict[str, Any]:
    findings: list[dict[str, Any]] = []
    shapes = layout_evidence.get("shapes", []) if isinstance(layout_evidence, dict) else []
    if not isinstance(shapes, list):
        raise WorkspaceError("LAYOUT_EVIDENCE_INVALID", "layout evidence shapes must be an array")
    slide_size = layout_evidence.get("slide_size", {}) if isinstance(layout_evidence, dict) else {}
    for shape in shapes:
        if not isinstance(shape, dict):
            findings.append(_finding("LAYOUT_EVIDENCE_INVALID", "Shape evidence entry is not an object"))
            continue
        if shape.get("editable"):
            if not shape.get("supported") or shape.get("after_mode") != "shape-to-fit-text":
                findings.append(_finding("AUTOFIT_NOT_VERIFIED", "Editable text shape is not verified as shape-to-fit-text", shape=shape))
            if shape.get("geometry_recalculated") is not True:
                findings.append(_finding("AUTOFIT_GEOMETRY_NOT_RECALCULATED", "Final geometry was not reread after AutoFit", shape=shape))
        if shape.get("overflow") is True:
            findings.append(_finding("TEXT_OVERFLOW", "Text overflow remains after AutoFit", shape=shape))
        if shape.get("hidden_text") is True:
            findings.append(_finding("HIDDEN_TEXT", "Hidden text remains", shape=shape))
        if shape.get("expected_single_line") is True and isinstance(shape.get("line_count"), int) and shape["line_count"] != 1:
            findings.append(_finding("SINGLE_LINE_OVERFLOW", "Single-line content wrapped", shape=shape, evidence={"line_count": shape["line_count"], "text": shape.get("text", "")}))
        size = shape.get("font_size_pt")
        minimum = shape.get("minimum_font_size_pt")
        maximum = shape.get("maximum_font_size_pt")
        if isinstance(size, (int, float)) and ((isinstance(minimum, (int, float)) and size < minimum) or (isinstance(maximum, (int, float)) and size > maximum)):
            findings.append(_finding("FONT_SIZE_OUT_OF_RANGE", "Effective font size is outside the template role range", shape=shape, evidence={"font_size_pt": size, "minimum": minimum, "maximum": maximum}))
        if shape.get("unapproved_font_substitution"):
            findings.append(_finding("UNAPPROVED_FONT_SUBSTITUTION", "Shape uses an unapproved font substitution", shape=shape))
        if shape.get("placeholder_unresolved"):
            findings.append(_finding("UNRESOLVED_PLACEHOLDER", "Template placeholder remains unresolved", shape=shape))
        bounds = shape.get("bounds") or shape.get("geometry_after")
        if isinstance(bounds, dict) and _outside(bounds, slide_size):
            findings.append(_finding("SHAPE_OFF_SLIDE", "Shape extends beyond the slide boundary", shape=shape, evidence={"bounds": bounds, "slide_size": slide_size}))
        for overlap in shape.get("overlaps", []) if isinstance(shape.get("overlaps"), list) else []:
            if isinstance(overlap, dict) and overlap.get("severity") in {"severe", "blocking"}:
                findings.append(_finding("SEVERE_OVERLAP", "AutoFit produced a severe shape overlap", shape=shape, evidence=overlap))
        image = shape.get("image")
        if isinstance(image, dict):
            source_ratio = image.get("source_aspect_ratio")
            frame_ratio = image.get("frame_aspect_ratio")
            fit = image.get("fit")
            if isinstance(source_ratio, (int, float)) and isinstance(frame_ratio, (int, float)) and source_ratio > 0 and frame_ratio > 0 and not math.isclose(source_ratio, frame_ratio, rel_tol=0.01) and fit not in {"contain", "cover", "crop"}:
                findings.append(_finding("IMAGE_ASPECT_RATIO_DRIFT", "Image ratio differs from its frame without a declared fit/crop policy", shape=shape, evidence=image))
    for group in layout_evidence.get("alignment_groups", []) if isinstance(layout_evidence, dict) else []:
        if isinstance(group, dict) and group.get("within_tolerance") is not True:
            findings.append(_finding("ALIGNMENT_GROUP_DRIFT", "Alignment or spacing group exceeds its declared tolerance", evidence=group))
    issue_entries = _issue_entries(issues)
    dispositions = layout_evidence.get("issue_dispositions", {}) if isinstance(layout_evidence, dict) else {}
    for index, issue in enumerate(issue_entries, 1):
        issue_id = str(issue.get("id") or issue.get("issue_id") or f"issue-{index:03d}")
        disposition = dispositions.get(issue_id) if isinstance(dispositions, dict) else None
        issue_type = str(issue.get("type") or issue.get("code") or "unknown").strip().lower()
        if not isinstance(disposition, dict):
            findings.append(_finding("STATIC_ISSUE_UNDISPOSITIONED", "OfficeCLI issue has no current disposition", issue_id=issue_id, evidence=issue))
            continue
        classification = disposition.get("classification")
        if issue_type in BLOCKING_ISSUE_TYPES or issue_type not in NON_BLOCKING_ISSUE_TYPES:
            findings.append(_finding("STATIC_ISSUE_BLOCKING", "OfficeCLI issue type is blocking or unknown", issue_id=issue_id, evidence={"issue": issue, "disposition": disposition or {}}))
        elif classification == "non-blocking" and disposition.get("reason") and disposition.get("render_observation"):
            findings.append(_finding("STATIC_ISSUE_DISPOSITIONED", "OfficeCLI issue has evidence-backed non-blocking disposition", issue_id=issue_id, evidence=disposition, status="non-blocking"))
        else:
            findings.append(_finding("STATIC_ISSUE_BLOCKING", "OfficeCLI issue is blocking or has incomplete evidence", issue_id=issue_id, evidence={"issue": issue, "disposition": disposition or {}}))
    blocking = [item for item in findings if item["status"] == "blocking"]
    return {
        "schema_version": "1.0",
        "report_kind": "layout-preflight",
        "status": "blocked" if blocking else "ready",
        "bindings": {
            "final_pptx_sha256": final_pptx_sha256,
            "template_profile_sha256": template_profile_sha256,
            "font_audit_sha256": font_audit_sha256,
            "officecli_issues_sha256": issues_sha256,
            "render_sha256": render_sha256,
            "layout_evidence_sha256": layout_evidence_sha256,
        },
        "shape_count": len(shapes),
        "issue_count": len(issue_entries),
        "findings": findings,
    }


def evaluate_workspace(workspace_root: Path, *, scope: str = "final") -> dict[str, Any]:
    root = workspace_root.resolve()
    workspace = load_json(contained_path(root, "workspace.json", must_exist=True))
    paths = workspace.get("paths", {}) if isinstance(workspace, dict) and isinstance(workspace.get("paths"), dict) else {}
    if scope not in {"final", "style-proof"}:
        raise WorkspaceError("LAYOUT_SCOPE_INVALID", "Layout preflight scope must be final or style-proof")
    style = scope == "style-proof"
    final = contained_path(root, paths.get("style_proof_pptx", "build/style-proof.pptx") if style else "build/final.pptx", must_exist=True)
    layout_path = contained_path(root, paths.get("style_proof_layout_evidence", "build/style-proof-layout-evidence.json") if style else paths.get("layout_evidence", "build/layout-evidence.json"), must_exist=True)
    issues_path = contained_path(root, paths.get("style_proof_officecli_issues", "build/style-proof-officecli-issues.json") if style else paths.get("officecli_issues", "build/officecli-issues.json"), must_exist=True)
    font_path = contained_path(root, paths.get("font_audit", "build/font-audit.json"), must_exist=True)
    template_hash = None
    if workspace.get("profile") == "template-edit":
        template_path = contained_path(root, paths.get("template_profile", "template-profile.json"), must_exist=True)
        template_hash = sha256_file(template_path)
    render_sha = None
    render_path = contained_path(root, paths.get("style_proof_render_manifest", "renders/style-proof/manifest.json") if style else paths.get("render_manifest", "renders/final/manifest.json"))
    if render_path.is_file():
        render = load_json(render_path)
        render_sha = render.get("render_sha256") if isinstance(render, dict) else None
    return evaluate_layout_preflight(
        final_pptx_sha256=sha256_file(final),
        template_profile_sha256=template_hash,
        font_audit_sha256=sha256_file(font_path),
        issues_sha256=sha256_file(issues_path),
        layout_evidence_sha256=sha256_file(layout_path),
        layout_evidence=load_json(layout_path),
        issues=load_json(issues_path),
        render_sha256=render_sha,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workspace")
    parser.add_argument("--scope", choices=("final", "style-proof"), default="final")
    parser.add_argument("--output")
    args = parser.parse_args()
    root = Path(args.workspace).resolve()
    try:
        result = evaluate_workspace(root, scope=args.scope)
        output = args.output or ("build/style-proof-layout-preflight.json" if args.scope == "style-proof" else "build/layout-preflight.json")
        write_json_atomic(contained_path(root, output), result)
        code = 0 if result["status"] == "ready" else 2
    except (OSError, ValueError, WorkspaceError) as error:
        result = {"status": "blocked", "error": {"code": getattr(error, "code", "LAYOUT_PREFLIGHT_BLOCKED"), "message": str(error)}}
        code = 2
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    return code


if __name__ == "__main__":
    sys.exit(main())
