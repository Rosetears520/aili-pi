#!/usr/bin/env python3
"""Plan or execute the registered PPTX workspace build pipeline."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any, Mapping, Sequence

from officecli_adapter import (
    OfficeCLIAdapterError,
    PINNED_VERSION,
    officecli_environment,
    officecli_command_argv,
    officecli_help_argv,
    parse_version,
    print_json,
    require_pinned_officecli,
    require_safe_officecli_argv,
)
from apply_text_autofit import apply_shape_to_fit_text

try:
    from workspace_core import (
        WorkspaceError,
        canonical_json_bytes,
        contained_path,
        load_json,
        relative_workspace_path,
        sha256_bytes,
        sha256_file,
        validate_renderer,
        validate_style_lock,
        validate_template_style_confirmation,
        write_json_atomic,
    )
except ImportError as error:  # pragma: no cover - exercised through the CLI failure path
    raise SystemExit(
        "build_workspace.py requires sibling workspace_core.py from the PPTX workspace package; "
        "install/restore that task-owned helper before building"
    ) from error


SUPPORTED_RENDERER_KIND = "pptxgenjs"
DEFAULT_BASE_OUTPUT = "build/base.pptx"
DEFAULT_DRAFT_OUTPUT = "build/draft.pptx"
DEFAULT_FINAL_OUTPUT = "build/final.pptx"
DEFAULT_READINESS_REPORT = "build/workspace-readiness.json"
DEFAULT_VALIDATION_REPORT = "build/package-validation.json"
DEFAULT_POSTBUILD_BATCH = "patches/officecli-postbuild.batch.json"
BUILD_KINDS = {"full", "style-proof"}
STYLE_PROOF_DEFAULTS = {
    "base": "build/style-proof-base.pptx",
    "draft": "build/style-proof-draft.pptx",
    "final": "build/style-proof.pptx",
    "validation": "build/style-proof-validation.json",
    "report": "build/style-proof-build-report.json",
}


def _require_ready_report(root: Path, relative: str) -> tuple[Path, dict[str, Any]]:
    path = contained_path(root, relative, must_exist=True, code="READINESS_PATH_OUTSIDE_WORKSPACE")
    report = load_json(path)
    if not isinstance(report, dict) or report.get("report_kind") not in {None, "workspace-readiness"}:
        raise WorkspaceError("READINESS_INVALID", "Workspace readiness report has an invalid shape", path=relative)
    if report.get("status") != "ready":
        raise WorkspaceError("WORKSPACE_NOT_READY", "Workspace readiness status must be ready", path=relative)
    from report_workspace_readiness import evaluate_workspace

    current = evaluate_workspace(root)
    binding_keys = (
        "status",
        "profile",
        "source_plan_sha256",
        "expected_outline_sha256",
        "source_fingerprint",
        "renderer_source_sha256",
        "slide_ids",
        "font_audit",
        "font_environment_sha256",
        "template_profile_sha256",
    )
    if any(report.get(key) != current.get(key) for key in binding_keys) or current.get("status") != "ready":
        raise WorkspaceError("READINESS_STALE", "Saved workspace readiness does not match current authored sources", path=relative)
    return path, report


def _batch_operation_order(value: Any) -> list[str]:
    operations = value.get("operations") if isinstance(value, dict) else value
    if not isinstance(operations, list):
        raise WorkspaceError(
            "POSTBUILD_BATCH_INVALID",
            "OfficeCLI postbuild batch must be an array or an object containing an operations array",
            path=DEFAULT_POSTBUILD_BATCH,
        )
    order: list[str] = []
    for index, operation in enumerate(operations):
        if not isinstance(operation, dict):
            raise WorkspaceError(
                "POSTBUILD_BATCH_INVALID",
                f"Postbuild operation {index + 1} must be an object",
                path=DEFAULT_POSTBUILD_BATCH,
            )
        identity = operation.get("id") or operation.get("operation_id") or f"operation-{index + 1:03d}"
        if not isinstance(identity, str) or not identity:
            raise WorkspaceError(
                "POSTBUILD_BATCH_INVALID",
                f"Postbuild operation {index + 1} has an invalid identity",
                path=DEFAULT_POSTBUILD_BATCH,
            )
        order.append(identity)
    return order


def _renderer_argv(node_bin: str, entrypoint: Path, base_output: Path) -> list[str]:
    return [node_bin, str(entrypoint), "--output", str(base_output)]


def prepare_build_plan(
    workspace_root: str | os.PathLike[str],
    *,
    build_kind: str = "full",
    node_bin: str | None = None,
    environ: Mapping[str, str] | None = None,
    base_output: str | None = None,
    draft_output: str | None = None,
    final_output: str | None = None,
    readiness_report: str = DEFAULT_READINESS_REPORT,
    validation_report: str | None = None,
    build_report: str | None = None,
) -> dict[str, Any]:
    if build_kind not in BUILD_KINDS:
        raise WorkspaceError("BUILD_KIND_INVALID", "Build kind must be full or style-proof", path=build_kind)
    root = Path(workspace_root).resolve()
    workspace_path = contained_path(root, "workspace.json", must_exist=True)
    workspace = load_json(workspace_path)
    if not isinstance(workspace, dict):
        raise WorkspaceError("WORKSPACE_INVALID", "workspace.json must contain an object", path="workspace.json")
    renderer = validate_renderer(root, workspace)
    if renderer["kind"] != SUPPORTED_RENDERER_KIND:
        raise WorkspaceError(
            "RENDERER_KIND_UNREGISTERED",
            f"build_workspace.py supports only registered renderer kind {SUPPORTED_RENDERER_KIND}",
            path=renderer["kind"],
        )
    readiness_path, readiness = _require_ready_report(root, readiness_report)
    style_lock: dict[str, Any] | None = None
    if build_kind == "full" and workspace.get("profile") == "from-scratch":
        style_lock = validate_style_lock(root, workspace)
    if build_kind == "full" and workspace.get("profile") == "template-edit":
        style_lock = validate_template_style_confirmation(root, workspace)
    entrypoint = contained_path(root, renderer["entrypoint"], must_exist=True)
    defaults = STYLE_PROOF_DEFAULTS if build_kind == "style-proof" else {
        "base": DEFAULT_BASE_OUTPUT,
        "draft": DEFAULT_DRAFT_OUTPUT,
        "final": DEFAULT_FINAL_OUTPUT,
        "validation": DEFAULT_VALIDATION_REPORT,
        "report": None,
    }
    base_output = base_output or defaults["base"]
    draft_output = draft_output or defaults["draft"]
    final_output = final_output or defaults["final"]
    validation_report = validation_report or defaults["validation"]
    base = contained_path(root, base_output, code="BUILD_OUTPUT_OUTSIDE_WORKSPACE")
    draft = contained_path(root, draft_output, code="BUILD_OUTPUT_OUTSIDE_WORKSPACE")
    final = contained_path(root, final_output, code="BUILD_OUTPUT_OUTSIDE_WORKSPACE")
    validation = contained_path(root, validation_report, code="BUILD_OUTPUT_OUTSIDE_WORKSPACE")
    paths = workspace.get("paths", {}) if isinstance(workspace.get("paths"), dict) else {}
    report_relative = build_report or defaults["report"] or paths.get("build_report", "build/build-report.json")
    report_path = contained_path(root, report_relative, code="BUILD_OUTPUT_OUTSIDE_WORKSPACE")
    outline_relative = paths.get("outline", "outline.json")
    outline_path = contained_path(root, outline_relative, must_exist=True)

    resolved_node = node_bin or shutil.which("node")
    if not resolved_node:
        raise WorkspaceError("RENDERER_RUNTIME_MISSING", "node is required for the pptxgenjs renderer")
    if Path(str(resolved_node)).name.lower() not in {"node", "node.exe"}:
        raise WorkspaceError("RENDERER_RUNTIME_INVALID", "The registered pptxgenjs runtime must be node")
    renderer_command = _renderer_argv(str(resolved_node), entrypoint, base)

    resolution = require_pinned_officecli(environ=environ)
    officecli = str(resolution["path"])

    batch_path = contained_path(root, DEFAULT_POSTBUILD_BATCH)
    batch_present = build_kind == "full" and batch_path.is_file()
    batch_order: list[str] = []
    if batch_present:
        batch_order = _batch_operation_order(load_json(batch_path))

    actions: list[dict[str, Any]] = []
    if batch_present:
        actions.extend(
            [
                {"kind": "help", "family": "batch", "argv": officecli_help_argv(officecli, "batch")},
                {
                    "kind": "command",
                    "family": "batch",
                    "argv": officecli_command_argv(officecli, "batch", str(draft), batch_input=str(batch_path)),
                },
            ]
        )
    actions.extend(
        [
            {"kind": "help", "family": "validate", "argv": officecli_help_argv(officecli, "validate")},
            {
                "kind": "command",
                "family": "validate",
                "argv": officecli_command_argv(officecli, "validate", str(final)),
                "capture_path": relative_workspace_path(root, validation),
            },
        ]
    )
    for action in actions:
        require_safe_officecli_argv(action["argv"])

    return {
        "schema_version": 1,
        "status": "planned",
        "build_kind": build_kind,
        "workspace_root": str(root),
        "shell": False,
        "renderer": {
            "kind": renderer["kind"],
            "entrypoint": renderer["entrypoint"],
            "argv": renderer_command,
        },
        "officecli": {
            "path": officecli,
            "path_source": resolution["source"],
            "expected_version": PINNED_VERSION,
            "version": resolution["version"],
            "skip_update": True,
        },
        "paths": {
            "workspace": "workspace.json",
            "outline": outline_relative,
            "readiness": relative_workspace_path(root, readiness_path),
            "base": relative_workspace_path(root, base),
            "draft": relative_workspace_path(root, draft),
            "final": relative_workspace_path(root, final),
            "validation": relative_workspace_path(root, validation),
            "build_report": relative_workspace_path(root, report_path),
            "postbuild_batch": DEFAULT_POSTBUILD_BATCH if batch_present else None,
        },
        "readiness": readiness,
        "style_lock": style_lock,
        "postbuild": {
            "enabled": batch_present,
            "operation_order": batch_order,
            "batch_sha256": sha256_file(batch_path) if batch_present else None,
        },
        "actions": actions,
        "input_hashes": {
            "workspace_sha256": sha256_file(workspace_path),
            "outline_sha256": sha256_file(outline_path),
            "renderer_entrypoint_sha256": sha256_file(entrypoint),
            "readiness_sha256": sha256_file(readiness_path),
            "style_lock_sha256": style_lock["sha256"] if style_lock else None,
        },
    }


def _run_argv(
    argv: Sequence[str],
    *,
    cwd: Path,
    environ: Mapping[str, str],
    timeout: int,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        list(argv),
        cwd=cwd,
        env=dict(environ),
        shell=False,
        check=False,
        capture_output=True,
        text=True,
        timeout=timeout,
    )


def execute_build_plan(
    plan: Mapping[str, Any],
    *,
    environ: Mapping[str, str] | None = None,
    timeout: int = 300,
) -> dict[str, Any]:
    if plan.get("status") != "planned" or plan.get("shell") is not False:
        raise ValueError("Only a validated argv-based build plan may execute")
    root = Path(str(plan["workspace_root"])).resolve()
    paths = plan["paths"]
    supplied_renderer_argv = plan.get("renderer", {}).get("argv")
    if not isinstance(supplied_renderer_argv, list) or not supplied_renderer_argv:
        raise ValueError("Renderer command is not an argv list")
    fresh_plan = prepare_build_plan(
        root,
        build_kind=str(plan.get("build_kind", "full")),
        node_bin=supplied_renderer_argv[0],
        environ=environ,
        base_output=paths["base"],
        draft_output=paths["draft"],
        final_output=paths["final"],
        readiness_report=paths["readiness"],
        validation_report=paths["validation"],
        build_report=paths["build_report"],
    )
    comparison_keys = ("build_kind", "renderer", "officecli", "paths", "readiness", "style_lock", "postbuild", "actions", "input_hashes")
    if any(plan.get(key) != fresh_plan.get(key) for key in comparison_keys):
        raise ValueError("Build plan is stale, mutated, or not produced by the registered orchestrator")
    plan = fresh_plan
    paths = plan["paths"]
    base = contained_path(root, paths["base"])
    draft = contained_path(root, paths["draft"])
    final = contained_path(root, paths["final"])
    report_path = contained_path(root, paths["build_report"])
    base.parent.mkdir(parents=True, exist_ok=True)

    renderer_argv = plan["renderer"].get("argv")
    if not isinstance(renderer_argv, list) or len(renderer_argv) != 4 or renderer_argv[-2] != "--output":
        raise ValueError("Renderer command is not the registered pptxgenjs argv shape")
    completed_renderer = _run_argv(
        renderer_argv,
        cwd=root,
        environ=dict(os.environ if environ is None else environ),
        timeout=timeout,
    )
    if completed_renderer.returncode != 0 or not base.is_file():
        raise RuntimeError(
            f"Registered renderer failed or omitted {paths['base']}: {completed_renderer.stderr.strip()}"
        )

    if plan["postbuild"]["enabled"]:
        draft.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(base, draft)
    else:
        final.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(base, final)

    command_results: list[dict[str, Any]] = []
    autofit_result: dict[str, Any] | None = None
    office_env = officecli_environment(environ)
    for action in plan["actions"]:
        if action["family"] == "validate" and plan["postbuild"]["enabled"] and not final.is_file():
            final.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(draft, final)
        if action["family"] == "validate" and autofit_result is None:
            autofit_relative = "build/style-proof-autofit-evidence.json" if plan["build_kind"] == "style-proof" else "build/autofit-evidence.json"
            layout_relative = "build/style-proof-layout-evidence.json" if plan["build_kind"] == "style-proof" else "build/layout-evidence.json"
            autofit_path = contained_path(root, autofit_relative)
            layout_path = contained_path(root, layout_relative)
            temporary_final = final.with_name(f".{final.name}.autofit-{os.getpid()}")
            autofit_result = apply_shape_to_fit_text(final, temporary_final)
            os.replace(temporary_final, final)
            autofit_result["output_pptx_sha256"] = sha256_file(final)
            write_json_atomic(autofit_path, autofit_result)
            write_json_atomic(
                layout_path,
                {
                    "schema_version": "1.0",
                    "report_kind": "layout-evidence",
                    "pptx_sha256": sha256_file(final),
                    "slide_size": {},
                    "shapes": autofit_result.get("shapes", []),
                    "alignment_groups": [],
                    "issue_dispositions": {},
                },
            )
            if autofit_result.get("status") == "blocked":
                raise RuntimeError("AutoFit could not be applied to every editable text shape")
        argv = action.get("argv")
        if not isinstance(argv, list):
            raise ValueError("OfficeCLI actions must contain argv lists")
        require_safe_officecli_argv(argv)
        completed = _run_argv(argv, cwd=root, environ=office_env, timeout=timeout)
        command_results.append(
            {
                "kind": action["kind"],
                "family": action["family"],
                "argv": argv,
                "returncode": completed.returncode,
            }
        )
        if completed.returncode != 0:
            raise RuntimeError(f"OfficeCLI {action['kind']} {action['family']} failed: {completed.stderr.strip()}")
        capture_relative = action.get("capture_path")
        if capture_relative:
            capture_path = contained_path(root, capture_relative)
            payload: Any
            try:
                payload = json.loads(completed.stdout) if completed.stdout.strip() else {}
            except json.JSONDecodeError:
                payload = {"stdout": completed.stdout, "stderr": completed.stderr}
            write_json_atomic(capture_path, payload)

    if not final.is_file():
        raise RuntimeError("OfficeCLI save did not produce the workspace-contained final PPTX")
    validation_path = contained_path(root, paths["validation"], must_exist=True)
    version_result = _run_argv(
        [plan["officecli"]["path"], "--version"],
        cwd=root,
        environ=office_env,
        timeout=timeout,
    )
    version = parse_version(version_result.stdout + "\n" + version_result.stderr) if version_result.returncode == 0 else None
    if version != PINNED_VERSION:
        raise RuntimeError(f"OfficeCLI version changed during build: expected {PINNED_VERSION}, found {version or 'unparseable'}")
    readiness = plan["readiness"]
    outline_path = contained_path(root, paths["outline"], must_exist=True)
    report = {
        "schema_version": "1.0",
        "report_kind": "build-report",
        "status": "succeeded",
        "build_kind": plan["build_kind"],
        "source_plan_sha256": readiness.get("source_plan_sha256"),
        "outline_sha256": sha256_file(outline_path),
        "source_fingerprint": readiness.get("source_fingerprint"),
        "renderer_source_sha256": readiness.get("renderer_source_sha256"),
        "renderer": {
            "kind": plan["renderer"]["kind"],
            "entrypoint": plan["renderer"]["entrypoint"],
            "entrypoint_sha256": plan["input_hashes"]["renderer_entrypoint_sha256"],
            "argv": renderer_argv,
        },
        "officecli": {
            "path": plan["officecli"]["path"],
            "version": version,
            "expected_version": PINNED_VERSION,
            "version_drift": version != PINNED_VERSION if version is not None else True,
            "environment": {"OFFICECLI_SKIP_UPDATE": "1"},
            "actions": command_results,
        },
        "base_pptx": {
            "path": paths["base"],
            "sha256": sha256_file(base),
            "size": base.stat().st_size,
        },
        "postbuild": {
            "applied": plan["postbuild"]["enabled"],
            "batch_path": paths["postbuild_batch"],
            "batch_sha256": plan["postbuild"]["batch_sha256"],
            "operation_order": plan["postbuild"]["operation_order"],
        },
        "style_lock": plan.get("style_lock"),
        "autofit": {
            "status": autofit_result.get("status") if autofit_result else "applied-awaiting-geometry-recalculation",
            "evidence_path": "build/style-proof-autofit-evidence.json" if plan["build_kind"] == "style-proof" else "build/autofit-evidence.json",
            "evidence_sha256": sha256_file(contained_path(root, "build/style-proof-autofit-evidence.json" if plan["build_kind"] == "style-proof" else "build/autofit-evidence.json", must_exist=True)),
            "pptx_sha256": sha256_file(final),
        },
        "final_pptx": {
            "path": paths["final"],
            "sha256": sha256_file(final),
            "size": final.stat().st_size,
        },
        "validation": {
            "status": "passed",
            "path": paths["validation"],
            "report_sha256": sha256_file(validation_path),
            "pptx_sha256": sha256_file(final),
        },
    }
    report["build_fingerprint"] = sha256_bytes(canonical_json_bytes(report))
    write_json_atomic(report_path, report)
    return report


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workspace", help="PPTX workspace root")
    parser.add_argument("--mode", choices=("plan", "execute"), default="plan")
    parser.add_argument("--kind", choices=sorted(BUILD_KINDS), default="full", dest="build_kind")
    parser.add_argument("--base-output")
    parser.add_argument("--draft-output")
    parser.add_argument("--final-output")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        plan = prepare_build_plan(
            args.workspace,
            build_kind=args.build_kind,
            base_output=args.base_output,
            draft_output=args.draft_output,
            final_output=args.final_output,
        )
        if args.mode == "plan":
            print_json(plan)
            return 0
        report = execute_build_plan(plan)
        print_json(report)
        return 0
    except (WorkspaceError, OfficeCLIAdapterError, OSError, RuntimeError, ValueError) as error:
        code = getattr(error, "code", "BUILD_BLOCKED")
        print_json({"status": "blocked", "error": {"code": code, "message": str(error)}})
        return 2


if __name__ == "__main__":
    sys.exit(main())
