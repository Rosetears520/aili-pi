#!/usr/bin/env python3
"""Emit a hash-bound, explicitly unreviewed visual inspection packet."""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from typing import Any, Sequence

from officecli_adapter import print_json
from workspace_core import (
    WorkspaceError,
    contained_path,
    load_json,
    sha256_file,
    write_json_atomic,
)


CHECKLIST = [
    "Open the current contact sheet and every per-slide PNG on the host.",
    "Check clipping, overlap, unintended overflow, and safe margins.",
    "Check visual hierarchy, reading order, contrast, and deck rhythm.",
    "Check image crop, distortion, resolution, and attribution placement.",
    "Check typography, glyph coverage, and visible font substitution.",
    "Record every finding with slide_id, severity, observation, and disposition.",
]


def emit_visual_review_packet(
    workspace_root: str | os.PathLike[str],
    *,
    review_scope: str = "final",
    pptx: str | None = None,
    render_manifest: str | None = None,
    output: str | None = None,
) -> dict[str, Any]:
    root = Path(workspace_root).resolve()
    workspace = load_json(contained_path(root, "workspace.json", must_exist=True))
    if not isinstance(workspace, dict):
        raise WorkspaceError("WORKSPACE_INVALID", "workspace.json must contain an object")
    if review_scope not in {"style-proof", "final"}:
        raise WorkspaceError("REVIEW_SCOPE_INVALID", "Review scope must be style-proof or final")
    paths = workspace.get("paths", {}) if isinstance(workspace.get("paths"), dict) else {}
    if review_scope == "style-proof":
        pptx = pptx or paths.get("style_proof_pptx", "build/style-proof.pptx")
        render_manifest = render_manifest or paths.get("style_proof_render_manifest", "renders/style-proof/manifest.json")
        output_relative = output or paths.get("style_proof_review", "reviews/style-proof-review.json")
    else:
        pptx = pptx or "build/final.pptx"
        render_manifest = render_manifest or "renders/final/manifest.json"
        output_relative = output or paths.get("visual_review", "reviews/visual-review-final.json")
    output_path = contained_path(root, output_relative, code="REVIEW_OUTPUT_OUTSIDE_WORKSPACE")
    pptx_path = contained_path(root, pptx, must_exist=True, code="REVIEW_INPUT_OUTSIDE_WORKSPACE")
    manifest_path = contained_path(root, render_manifest, must_exist=True, code="REVIEW_INPUT_OUTSIDE_WORKSPACE")
    manifest = load_json(manifest_path)
    if not isinstance(manifest, dict):
        raise WorkspaceError("RENDER_MANIFEST_INVALID", "Render manifest must contain an object", path=render_manifest)
    pptx_sha = sha256_file(pptx_path)
    if manifest.get("pptx_sha256") != pptx_sha:
        raise WorkspaceError("STALE_RENDER", "Render manifest is not bound to the current PPTX", path=render_manifest)
    slide_ids = manifest.get("slide_ids")
    artifacts = manifest.get("artifacts")
    if not isinstance(slide_ids, list) or not isinstance(artifacts, list) or not artifacts:
        raise WorkspaceError("RENDER_MANIFEST_INVALID", "Render manifest needs slide IDs and artifacts", path=render_manifest)

    render_files: list[dict[str, Any]] = []
    pages: list[dict[str, Any]] = []
    artifact_ids: list[str] = []
    for index, artifact in enumerate(artifacts):
        if not isinstance(artifact, dict) or not isinstance(artifact.get("path"), str):
            raise WorkspaceError("RENDER_MANIFEST_INVALID", f"Render artifact {index + 1} is invalid", path=render_manifest)
        path = contained_path(root, artifact["path"], must_exist=True)
        current_hash = sha256_file(path)
        if artifact.get("sha256") != current_hash:
            raise WorkspaceError("STALE_RENDER", "Render file hash is stale or mutated", path=artifact["path"])
        slide_id = artifact.get("slide_id")
        if not isinstance(slide_id, str):
            raise WorkspaceError("RENDER_MANIFEST_INVALID", "Render artifact lacks slide_id", path=artifact["path"])
        artifact_ids.append(slide_id)
        record = {
            "path": artifact["path"],
            "sha256": current_hash,
            "slide_id": slide_id,
            "page_id": artifact.get("page_id") or f"slide-{index + 1:02d}",
        }
        render_files.append(record)
        pages.append(
            {
                "slide_id": record["slide_id"],
                "page_id": record["page_id"],
                "render_path": record["path"],
                "render_sha256": current_hash,
                "inspection_status": "not-inspected",
                "checks": {
                    "alignment": "not-inspected",
                    "spacing": "not-inspected",
                    "text_wrap": "not-inspected",
                    "overflow": "not-inspected",
                    "image_aspect": "not-inspected",
                    "font_rendering": "not-inspected",
                    "reference_fidelity": "not-inspected",
                },
                "observations": [],
            }
        )
    if artifact_ids != slide_ids:
        raise WorkspaceError("STALE_RENDER", "Render artifact order does not match manifest slide IDs", path=render_manifest)
    contact = manifest.get("contact_sheet")
    if not isinstance(contact, dict) or not isinstance(contact.get("path"), str):
        raise WorkspaceError("RENDER_MANIFEST_INVALID", "Render manifest needs a contact sheet", path=render_manifest)
    contact_path = contained_path(root, contact["path"], must_exist=True)
    contact_hash = sha256_file(contact_path)
    if contact.get("sha256") != contact_hash:
        raise WorkspaceError("STALE_RENDER", "Contact sheet hash is stale or mutated", path=contact["path"])
    render_files.insert(
        0,
        {
            "path": contact["path"],
            "sha256": contact_hash,
            "slide_id": "_contact-sheet",
            "page_id": "contact-sheet",
        },
    )

    packet = {
        "schema_version": "1.0",
        "report_kind": "visual-review",
        "review_scope": review_scope,
        "status": "awaiting-host-image-inspection",
        "reviewer": None,
        "disposition": "unreviewed",
        "auto_pass": False,
        "pptx_path": pptx,
        "pptx_sha256": pptx_sha,
        "render_manifest_path": render_manifest,
        "render_manifest_sha256": sha256_file(manifest_path),
        "render_sha256": manifest.get("render_sha256"),
        "render_files": render_files,
        "slide_ids": slide_ids,
        "pages": pages,
        "checklist": CHECKLIST,
        "findings": [],
        "review_output_path": output_relative,
        "host_action_required": "The current host must open and inspect the bound contact sheet and every per-slide image before recording any pass disposition.",
        "file_existence_is_review": False,
        "watch_is_visual_review_proof": False,
    }
    write_json_atomic(output_path, packet)
    return packet


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workspace", help="PPTX workspace root")
    parser.add_argument("--review-scope", choices=("style-proof", "final"), default="final")
    parser.add_argument("--pptx")
    parser.add_argument("--render-manifest")
    parser.add_argument("--output", help="Workspace-relative visual review output path")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        packet = emit_visual_review_packet(
            args.workspace,
            review_scope=args.review_scope,
            pptx=args.pptx,
            render_manifest=args.render_manifest,
            output=args.output,
        )
        print_json(packet)
        return 0
    except (WorkspaceError, OSError, ValueError) as error:
        print_json({"status": "blocked", "error": {"code": getattr(error, "code", "VISUAL_PACKET_BLOCKED"), "message": str(error)}})
        return 2


if __name__ == "__main__":
    sys.exit(main())
