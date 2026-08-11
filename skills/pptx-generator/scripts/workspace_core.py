#!/usr/bin/env python3
"""Shared deterministic helpers for PPTX workspaces (Python stdlib only)."""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path, PureWindowsPath
from typing import Any, Iterable


SCHEMA_VERSION = "1.0"
GENERATOR_VERSION = "pptx-workspace-1"
SUPPORTED_PROFILES = {"from-scratch", "template-edit", "inspect"}
RENDERER_REGISTRY = {
    "pptxgenjs": {"extensions": {".js", ".cjs", ".mjs"}},
}
STYLE_PROOF_PATHS = {
    "build_report": "build/style-proof-build-report.json",
    "pptx": "build/style-proof.pptx",
    "render_manifest": "renders/style-proof/manifest.json",
    "review": "reviews/style-proof-review.json",
    "lock": "reviews/style-lock.json",
}


class WorkspaceError(ValueError):
    """A structured workspace contract violation."""

    def __init__(self, code: str, message: str, *, path: str | None = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.path = path

    def diagnostic(self) -> dict[str, str]:
        result = {"code": self.code, "message": self.message}
        if self.path is not None:
            result["path"] = self.path
        return result


def normalize_markdown_bytes(raw: bytes) -> bytes:
    """Strip one UTF-8 BOM and normalize CRLF to LF without other rewriting."""
    if raw.startswith(b"\xef\xbb\xbf"):
        raw = raw[3:]
    return raw.replace(b"\r\n", b"\n")


def read_normalized_markdown(path: Path) -> tuple[str, bytes]:
    normalized = normalize_markdown_bytes(path.read_bytes())
    return normalized.decode("utf-8"), normalized


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonical_json_bytes(value: Any) -> bytes:
    return (
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    ).encode("utf-8")


def load_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except FileNotFoundError as error:
        raise WorkspaceError("FILE_MISSING", "Required JSON file is missing", path=str(path)) from error
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise WorkspaceError("INVALID_JSON", f"Invalid JSON: {error}", path=str(path)) from error


def write_json_atomic(path: Path, value: Any) -> None:
    """Write deterministic JSON only after all validation has succeeded."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.tmp-{os.getpid()}")
    temporary.write_bytes(canonical_json_bytes(value))
    os.replace(temporary, path)


def contained_path(
    workspace_root: Path,
    relative: str,
    *,
    must_exist: bool = False,
    code: str = "PATH_OUTSIDE_WORKSPACE",
) -> Path:
    if not isinstance(relative, str) or not relative.strip():
        raise WorkspaceError(code, "Path must be a non-empty workspace-relative string", path=str(relative))
    candidate_value = Path(relative)
    windows_value = PureWindowsPath(relative)
    if (
        candidate_value.is_absolute()
        or windows_value.is_absolute()
        or bool(windows_value.drive)
        or "\\" in relative
        or ".." in candidate_value.parts
    ):
        raise WorkspaceError(code, "Absolute paths and '..' segments are not allowed", path=relative)
    root = workspace_root.resolve()
    candidate = (root / candidate_value).resolve()
    try:
        candidate.relative_to(root)
    except ValueError as error:
        raise WorkspaceError(code, "Path resolves outside the workspace", path=relative) from error
    if must_exist and not candidate.exists():
        raise WorkspaceError("FILE_MISSING", "Required workspace path is missing", path=relative)
    return candidate


def relative_workspace_path(workspace_root: Path, path: Path) -> str:
    try:
        return path.resolve().relative_to(workspace_root.resolve()).as_posix()
    except ValueError as error:
        raise WorkspaceError(
            "PATH_OUTSIDE_WORKSPACE",
            "Path is not contained by the workspace",
            path=str(path),
        ) from error


def iter_files(root: Path, relative_roots: Iterable[str]) -> list[Path]:
    files: set[Path] = set()
    for relative in relative_roots:
        path = contained_path(root, relative)
        if path.is_file():
            files.add(path)
        elif path.is_dir():
            for child in path.rglob("*"):
                if child.is_file() and not child.is_symlink():
                    files.add(child)
    return sorted(files, key=lambda item: relative_workspace_path(root, item))


def hash_manifest(root: Path, relative_roots: Iterable[str]) -> dict[str, Any]:
    entries = [
        {
            "path": relative_workspace_path(root, path),
            "sha256": sha256_file(path),
            "size": path.stat().st_size,
        }
        for path in iter_files(root, relative_roots)
    ]
    return {"sha256": sha256_bytes(canonical_json_bytes(entries)), "files": entries}


def validate_renderer(workspace_root: Path, workspace: dict[str, Any]) -> dict[str, str]:
    renderer = workspace.get("renderer")
    if not isinstance(renderer, dict):
        raise WorkspaceError("RENDERER_MISSING", "A registered renderer is required")
    forbidden = sorted(set(renderer).intersection({"command", "command_string", "shell", "argv", "args"}))
    if forbidden:
        raise WorkspaceError(
            "RENDERER_COMMAND_FORBIDDEN",
            f"Renderer configuration contains forbidden command fields: {', '.join(forbidden)}",
        )
    kind = renderer.get("kind")
    if kind not in RENDERER_REGISTRY:
        raise WorkspaceError("RENDERER_KIND_UNREGISTERED", "Renderer kind is not registered", path=str(kind))
    entrypoint = renderer.get("entrypoint")
    path = contained_path(
        workspace_root,
        entrypoint,
        must_exist=False,
        code="RENDERER_ENTRYPOINT_OUTSIDE_WORKSPACE",
    )
    if not path.is_file():
        raise WorkspaceError("RENDERER_ENTRYPOINT_MISSING", "Renderer entrypoint is not a file", path=entrypoint)
    if path.suffix.lower() not in RENDERER_REGISTRY[kind]["extensions"]:
        raise WorkspaceError(
            "RENDERER_ENTRYPOINT_INVALID",
            "Renderer entrypoint extension is not allowed for its registered kind",
            path=entrypoint,
        )
    return {"kind": kind, "entrypoint": relative_workspace_path(workspace_root, path)}


def workspace_source_roots(workspace: dict[str, Any]) -> list[str]:
    profile = workspace.get("profile")
    roots = ["workspace.json", "sources"]
    if profile in {"from-scratch", "template-edit"}:
        configured_value = workspace.get("paths", {})
        configured = configured_value if isinstance(configured_value, dict) else {}
        roots.extend(
            [
                configured.get("plan", "per-slide-content-plan.md"),
                configured.get("design_brief", "design-brief.json"),
                configured.get("design_contract", "design-contract.json"),
                configured.get("font_contract", "font-contract.json"),
                configured.get("font_environment", "font-environment.json"),
                configured.get("template_profile", "template-profile.json") if profile == "template-edit" else "",
                configured.get("evidence_plan", "evidence-plan.json"),
                configured.get("asset_plan", "asset-plan.json"),
                "notes.md",
                "data",
                "scripts",
                "src",
                "assets",
                "patches",
            ]
        )
    return [value for value in roots if isinstance(value, str) and value]


def source_fingerprint(workspace_root: Path, workspace: dict[str, Any]) -> dict[str, Any]:
    roots = workspace_source_roots(workspace)
    manifest_specs = (
        ("sources/manifest.json", "sources"),
        ("assets/manifest.json", "assets"),
    )
    for manifest_relative, collection_name in manifest_specs:
        manifest_path = contained_path(workspace_root, manifest_relative)
        if not manifest_path.is_file():
            continue
        manifest = load_json(manifest_path)
        collection = manifest.get(collection_name, []) if isinstance(manifest, dict) else []
        if not isinstance(collection, list):
            continue
        for item in collection:
            if isinstance(item, dict) and isinstance(item.get("path"), str) and item["path"]:
                roots.append(item["path"])
    return hash_manifest(workspace_root, roots)


def renderer_fingerprint(workspace_root: Path, workspace: dict[str, Any]) -> dict[str, Any]:
    renderer = validate_renderer(workspace_root, workspace)
    src_root = Path(renderer["entrypoint"]).parts[0]
    return hash_manifest(workspace_root, [src_root])


def render_manifest_fingerprint(workspace_root: Path, render: dict[str, Any]) -> dict[str, Any]:
    """Verify every render artifact and return its deterministic aggregate hash."""
    slide_ids = render.get("slide_ids")
    artifacts = render.get("artifacts")
    contact = render.get("contact_sheet")
    if not isinstance(slide_ids, list) or not slide_ids or not all(isinstance(item, str) for item in slide_ids):
        raise WorkspaceError("RENDER_MANIFEST_INVALID", "Render manifest needs ordered slide IDs")
    if not isinstance(artifacts, list) or not artifacts:
        raise WorkspaceError("RENDER_MANIFEST_INVALID", "Render manifest needs per-slide artifacts")
    if not isinstance(contact, dict):
        raise WorkspaceError("RENDER_MANIFEST_INVALID", "Render manifest needs a contact sheet")

    aggregate: list[dict[str, str]] = []
    artifact_ids: list[str] = []
    for item in artifacts:
        if not isinstance(item, dict) or not all(isinstance(item.get(key), str) for key in ("slide_id", "path", "sha256")):
            raise WorkspaceError("RENDER_MANIFEST_INVALID", "Every render artifact needs slide_id, path, and sha256")
        path = contained_path(workspace_root, item["path"], must_exist=True)
        if sha256_file(path) != item["sha256"]:
            raise WorkspaceError("STALE_RENDER", "Render artifact hash is stale or mutated", path=item["path"])
        artifact_ids.append(item["slide_id"])
        aggregate.append({"slide_id": item["slide_id"], "path": item["path"], "sha256": item["sha256"]})
    if artifact_ids != slide_ids:
        raise WorkspaceError("STALE_RENDER", "Render artifacts do not exactly match ordered slide IDs")

    if not all(isinstance(contact.get(key), str) for key in ("path", "sha256")):
        raise WorkspaceError("RENDER_MANIFEST_INVALID", "Contact sheet needs path and sha256")
    contact_path = contained_path(workspace_root, contact["path"], must_exist=True)
    if sha256_file(contact_path) != contact["sha256"]:
        raise WorkspaceError("STALE_RENDER", "Contact-sheet hash is stale or mutated", path=contact["path"])
    aggregate.append({"slide_id": "_contact-sheet", "path": contact["path"], "sha256": contact["sha256"]})
    computed = sha256_bytes(canonical_json_bytes(aggregate))
    if render.get("render_sha256") != computed:
        raise WorkspaceError("STALE_RENDER", "Render aggregate hash is stale or invalid")
    return {"sha256": computed, "slide_ids": slide_ids, "files": aggregate}


def current_style_lock_bindings(workspace_root: Path, workspace: dict[str, Any] | None = None) -> dict[str, Any]:
    """Compute and validate every current input bound by a from-scratch style lock."""
    root = workspace_root.resolve()
    workspace = load_json(root / "workspace.json") if workspace is None else workspace
    if not isinstance(workspace, dict):
        raise WorkspaceError("WORKSPACE_INVALID", "workspace.json must contain an object")
    paths = workspace.get("paths", {}) if isinstance(workspace.get("paths"), dict) else {}
    outline_relative = paths.get("outline", "outline.json")
    design_relative = paths.get("design_contract", "design-contract.json")
    build_relative = paths.get("style_proof_build_report", STYLE_PROOF_PATHS["build_report"])
    pptx_relative = paths.get("style_proof_pptx", STYLE_PROOF_PATHS["pptx"])
    render_relative = paths.get("style_proof_render_manifest", STYLE_PROOF_PATHS["render_manifest"])
    review_relative = paths.get("style_proof_review", STYLE_PROOF_PATHS["review"])

    outline_path = contained_path(root, outline_relative, must_exist=True)
    design_path = contained_path(root, design_relative, must_exist=True)
    build_path = contained_path(root, build_relative, must_exist=True)
    pptx_path = contained_path(root, pptx_relative, must_exist=True)
    render_path = contained_path(root, render_relative, must_exist=True)
    review_path = contained_path(root, review_relative, must_exist=True)
    source = source_fingerprint(root, workspace)
    renderer = renderer_fingerprint(root, workspace)

    build = load_json(build_path)
    pptx_sha = sha256_file(pptx_path)
    expected_build_links = {
        "build_kind": "style-proof",
        "source_fingerprint": source["sha256"],
        "renderer_source_sha256": renderer["sha256"],
        "outline_sha256": sha256_file(outline_path),
    }
    if not isinstance(build, dict) or build.get("status") != "succeeded" or any(build.get(key) != value for key, value in expected_build_links.items()):
        raise WorkspaceError("STALE_STYLE_PROOF_BUILD", "Style-proof build report is not current for authored sources")
    final_record = build.get("final_pptx")
    if not isinstance(final_record, dict) or final_record.get("path") != pptx_relative or final_record.get("sha256") != pptx_sha:
        raise WorkspaceError("STALE_STYLE_PROOF_BUILD", "Style-proof build report is not bound to the current proof PPTX")

    render = load_json(render_path)
    if not isinstance(render, dict) or render.get("pptx_sha256") != pptx_sha:
        raise WorkspaceError("STALE_RENDER", "Style-proof render is not bound to the current proof PPTX")
    render_fingerprint = render_manifest_fingerprint(root, render)

    review = load_json(review_path)
    findings = review.get("findings") if isinstance(review, dict) else None
    pages = review.get("pages") if isinstance(review, dict) else None
    page_ids = [item.get("slide_id") for item in pages if isinstance(item, dict)] if isinstance(pages, list) else []
    review_current = (
        isinstance(review, dict)
        and isinstance(review.get("reviewer"), str)
        and bool(review["reviewer"].strip())
        and review.get("disposition") == "pass"
        and review.get("review_scope") == "style-proof"
        and review.get("pptx_sha256") == pptx_sha
        and review.get("render_sha256") == render_fingerprint["sha256"]
        and review.get("slide_ids") == render_fingerprint["slide_ids"]
        and page_ids == render_fingerprint["slide_ids"]
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
        and isinstance(findings, list)
        and all(
            isinstance(item, dict)
            and item.get("slide_id") in render_fingerprint["slide_ids"]
            and item.get("disposition") == "resolved"
            for item in findings
        )
    )
    if not review_current:
        raise WorkspaceError("STYLE_PROOF_REVIEW_NOT_PASSING", "Style-proof review is missing, stale, or not passing")

    return {
        "schema_version": SCHEMA_VERSION,
        "source_fingerprint": source["sha256"],
        "outline_sha256": sha256_file(outline_path),
        "renderer_source_sha256": renderer["sha256"],
        "design_contract_sha256": sha256_file(design_path),
        "proof_build_report_sha256": sha256_file(build_path),
        "proof_pptx_sha256": pptx_sha,
        "proof_render_sha256": render_fingerprint["sha256"],
        "review_sha256": sha256_file(review_path),
        "slide_ids": render_fingerprint["slide_ids"],
        "disposition": "locked",
    }


def validate_style_lock(workspace_root: Path, workspace: dict[str, Any] | None = None) -> dict[str, Any]:
    """Require an exact current lock for a full from-scratch build."""
    root = workspace_root.resolve()
    workspace = load_json(root / "workspace.json") if workspace is None else workspace
    paths = workspace.get("paths", {}) if isinstance(workspace, dict) and isinstance(workspace.get("paths"), dict) else {}
    lock_relative = paths.get("style_lock", STYLE_PROOF_PATHS["lock"])
    lock_path = contained_path(root, lock_relative)
    if not lock_path.is_file():
        raise WorkspaceError("STYLE_LOCK_MISSING", "A reviewed current Style Proof is required before a full from-scratch build", path=lock_relative)
    lock = load_json(lock_path)
    try:
        expected = current_style_lock_bindings(root, workspace)
    except WorkspaceError as error:
        raise WorkspaceError("STYLE_LOCK_STALE", f"Style lock inputs are stale: {error.code}", path=lock_relative) from error
    if lock != expected:
        raise WorkspaceError("STYLE_LOCK_STALE", "Style lock does not exactly match the current proof and authored sources", path=lock_relative)
    return {"path": lock_relative, "sha256": sha256_file(lock_path), "lock": lock}


def current_template_style_bindings(workspace_root: Path, workspace: dict[str, Any] | None = None) -> dict[str, Any]:
    root = workspace_root.resolve()
    workspace = load_json(root / "workspace.json") if workspace is None else workspace
    if not isinstance(workspace, dict) or workspace.get("profile") != "template-edit":
        raise WorkspaceError("TEMPLATE_STYLE_PROFILE_INVALID", "Template Style Proof applies only to template-edit workspaces")
    paths = workspace.get("paths", {}) if isinstance(workspace.get("paths"), dict) else {}
    profile_path = contained_path(root, paths.get("template_profile", "template-profile.json"), must_exist=True)
    font_path = contained_path(root, paths.get("font_environment", "font-environment.json"), must_exist=True)
    pptx_path = contained_path(root, paths.get("style_proof_pptx", STYLE_PROOF_PATHS["pptx"]), must_exist=True)
    render_path = contained_path(root, paths.get("style_proof_render_manifest", STYLE_PROOF_PATHS["render_manifest"]), must_exist=True)
    baseline_render_path = contained_path(root, paths.get("style_proof_baseline_render_manifest", "renders/style-proof/baseline/manifest.json"), must_exist=True)
    review_path = contained_path(root, paths.get("style_proof_review", STYLE_PROOF_PATHS["review"]), must_exist=True)
    preflight_path = contained_path(root, paths.get("style_proof_layout_preflight", "build/style-proof-layout-preflight.json"), must_exist=True)
    font_audit_path = contained_path(root, paths.get("font_audit", "build/font-audit.json"), must_exist=True)
    issues_path = contained_path(root, paths.get("style_proof_officecli_issues", "build/style-proof-officecli-issues.json"), must_exist=True)
    layout_evidence_path = contained_path(root, paths.get("style_proof_layout_evidence", "build/style-proof-layout-evidence.json"), must_exist=True)
    render = load_json(render_path)
    if not isinstance(render, dict) or render.get("pptx_sha256") != sha256_file(pptx_path):
        raise WorkspaceError("STALE_RENDER", "Template Style Proof render is not bound to the current proof PPTX")
    render_fingerprint = render_manifest_fingerprint(root, render)
    profile = load_json(profile_path)
    profile_source = profile.get("source") if isinstance(profile, dict) else None
    if not isinstance(profile_source, dict) or not isinstance(profile_source.get("path"), str):
        raise WorkspaceError("TEMPLATE_PROFILE_INVALID", "Template profile lacks its controlling source path")
    baseline_template_path = contained_path(root, profile_source["path"], must_exist=True)
    baseline_template_sha = sha256_file(baseline_template_path)
    if profile_source.get("sha256") != baseline_template_sha:
        raise WorkspaceError("TEMPLATE_PROFILE_STALE", "Template profile source hash is stale")
    baseline_render = load_json(baseline_render_path)
    if not isinstance(baseline_render, dict) or baseline_render.get("pptx_sha256") != baseline_template_sha:
        raise WorkspaceError("STALE_RENDER", "Baseline Style Proof render is not bound to the controlling template")
    baseline_fingerprint = render_manifest_fingerprint(root, baseline_render)
    if baseline_fingerprint["slide_ids"] != render_fingerprint["slide_ids"]:
        raise WorkspaceError("TEMPLATE_STYLE_BASELINE_MISMATCH", "Baseline/current Style Proof slide selections differ")
    review = load_json(review_path)
    pages = review.get("pages") if isinstance(review, dict) else None
    page_ids = [item.get("slide_id") for item in pages if isinstance(item, dict)] if isinstance(pages, list) else []
    review_current = (
        isinstance(review, dict)
        and isinstance(review.get("reviewer"), str)
        and bool(review["reviewer"].strip())
        and review.get("review_scope") == "style-proof"
        and review.get("disposition") == "pass"
        and review.get("pptx_sha256") == sha256_file(pptx_path)
        and review.get("render_sha256") == render_fingerprint["sha256"]
        and review.get("slide_ids") == render_fingerprint["slide_ids"]
        and page_ids == render_fingerprint["slide_ids"]
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
        and isinstance(review.get("findings"), list)
        and all(isinstance(item, dict) and item.get("disposition") == "resolved" for item in review["findings"])
    )
    if not review_current:
        raise WorkspaceError("TEMPLATE_STYLE_REVIEW_NOT_PASSING", "Template Style Proof review is missing, stale, or lacks page-level evidence")
    preflight = load_json(preflight_path)
    preflight_bindings = preflight.get("bindings", {}) if isinstance(preflight, dict) else {}
    if (
        not isinstance(preflight, dict)
        or preflight.get("status") != "ready"
        or preflight_bindings.get("final_pptx_sha256") != sha256_file(pptx_path)
        or preflight_bindings.get("template_profile_sha256") != sha256_file(profile_path)
        or preflight_bindings.get("font_audit_sha256") != sha256_file(font_audit_path)
        or preflight_bindings.get("officecli_issues_sha256") != sha256_file(issues_path)
        or preflight_bindings.get("layout_evidence_sha256") != sha256_file(layout_evidence_path)
        or preflight_bindings.get("render_sha256") != render_fingerprint["sha256"]
    ):
        raise WorkspaceError("TEMPLATE_STYLE_PREFLIGHT_NOT_PASSING", "Template Style Proof layout preflight is missing, stale, or blocked")
    bindings = {
        "source_fingerprint": source_fingerprint(root, workspace)["sha256"],
        "outline_sha256": sha256_file(contained_path(root, paths.get("outline", "outline.json"), must_exist=True)),
        "renderer_source_sha256": renderer_fingerprint(root, workspace)["sha256"],
        "baseline_template_sha256": baseline_template_sha,
        "baseline_render_sha256": baseline_fingerprint["sha256"],
        "template_profile_sha256": sha256_file(profile_path),
        "font_environment_sha256": sha256_file(font_path),
        "proof_pptx_sha256": sha256_file(pptx_path),
        "proof_render_sha256": render_fingerprint["sha256"],
        "proof_layout_preflight_sha256": sha256_file(preflight_path),
        "proof_review_sha256": sha256_file(review_path),
        "slide_ids": render_fingerprint["slide_ids"],
    }
    return bindings


def validate_template_style_confirmation(workspace_root: Path, workspace: dict[str, Any] | None = None) -> dict[str, Any]:
    root = workspace_root.resolve()
    workspace = load_json(root / "workspace.json") if workspace is None else workspace
    paths = workspace.get("paths", {}) if isinstance(workspace, dict) and isinstance(workspace.get("paths"), dict) else {}
    relative = paths.get("template_style_confirmation", "reviews/template-style-confirmation.json")
    path = contained_path(root, relative, must_exist=True)
    confirmation = load_json(path)
    bindings = current_template_style_bindings(root, workspace)
    roles = confirmation.get("role_coverage", {}) if isinstance(confirmation, dict) else {}
    required_roles = {"image-or-chart", "longest-text", "densest-numeric"}
    role_ids = {roles.get(role) for role in required_roles} if isinstance(roles, dict) else set()
    expected_hash = sha256_bytes(canonical_json_bytes(bindings))
    valid = (
        isinstance(confirmation, dict)
        and confirmation.get("status") == "confirmed"
        and isinstance(confirmation.get("confirmed_by"), str)
        and bool(confirmation["confirmed_by"].strip())
        and confirmation.get("bindings") == bindings
        and confirmation.get("proof_hash") == expected_hash
        and len(role_ids) >= 1
        and None not in role_ids
        and role_ids.issubset(set(bindings["slide_ids"]))
    )
    if not valid:
        raise WorkspaceError("TEMPLATE_STYLE_CONFIRMATION_STALE", "Template Style Proof confirmation is missing, stale, or lacks required role coverage", path=relative)
    return {"path": relative, "sha256": sha256_file(path), "confirmation": confirmation}


def blocker(
    code: str,
    message: str,
    *,
    severity: str = "hard",
    path: str | None = None,
    next_action: str,
) -> dict[str, str]:
    result = {
        "code": code,
        "message": message,
        "severity": severity,
        "next_action": next_action,
    }
    if path is not None:
        result["path"] = path
    return result


def select_next_action(blockers: list[dict[str, Any]], default: str) -> dict[str, str]:
    if not blockers:
        return {"type": default, "reason": "No blocking action remains"}
    first = blockers[0]
    return {"type": first["next_action"], "reason": first["code"]}
