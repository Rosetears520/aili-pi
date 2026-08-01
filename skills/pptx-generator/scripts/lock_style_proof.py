#!/usr/bin/env python3
"""Create an exact style lock from a current, actually reviewed Style Proof."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Sequence

from workspace_core import (
    STYLE_PROOF_PATHS,
    WorkspaceError,
    contained_path,
    current_style_lock_bindings,
    load_json,
    write_json_atomic,
)


def create_style_lock(workspace_root: Path, *, output: str | None = None) -> dict[str, object]:
    root = workspace_root.resolve()
    workspace = load_json(root / "workspace.json")
    if not isinstance(workspace, dict) or workspace.get("profile") != "from-scratch":
        raise WorkspaceError("STYLE_PROOF_PROFILE_INVALID", "Style Proof locks apply only to from-scratch workspaces")
    paths = workspace.get("paths", {}) if isinstance(workspace.get("paths"), dict) else {}
    output_relative = output or paths.get("style_lock", STYLE_PROOF_PATHS["lock"])
    output_path = contained_path(root, output_relative, code="STYLE_LOCK_OUTPUT_OUTSIDE_WORKSPACE")
    lock = current_style_lock_bindings(root, workspace)
    write_json_atomic(output_path, lock)
    return {"status": "locked", "output_path": output_relative, "style_lock": lock}


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workspace", help="From-scratch PPTX workspace root")
    parser.add_argument("--output", help="Workspace-relative style-lock path")
    args = parser.parse_args(argv)
    try:
        result = create_style_lock(Path(args.workspace), output=args.output)
        code = 0
    except (WorkspaceError, OSError, ValueError) as error:
        result = {"status": "blocked", "error": {"code": getattr(error, "code", "STYLE_LOCK_BLOCKED"), "message": str(error)}}
        code = 2
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    return code


if __name__ == "__main__":
    sys.exit(main())
