#!/usr/bin/env python3
"""Initialize a profile-specific PPTX workspace without overwriting authored files."""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from pathlib import Path

from workspace_core import SUPPORTED_PROFILES, WorkspaceError, load_json


DECK_NAME_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def _render_template(value: bytes, replacements: dict[str, str]) -> bytes:
    text = value.decode("utf-8")
    for marker, replacement in replacements.items():
        text = text.replace("{{" + marker + "}}", replacement)
    return text.encode("utf-8")


def initialize_workspace(
    target: Path,
    profile: str,
    deck_name: str,
    deck_title: str,
    *,
    update: bool = False,
) -> dict[str, object]:
    if profile not in SUPPORTED_PROFILES:
        raise WorkspaceError("PROFILE_UNSUPPORTED", "Unsupported workspace profile", path=profile)
    if not DECK_NAME_RE.fullmatch(deck_name):
        raise WorkspaceError("DECK_NAME_INVALID", "Deck name must use lower-kebab syntax", path=deck_name)
    if not deck_title.strip() or "\n" in deck_title or "\r" in deck_title or "**" in deck_title:
        raise WorkspaceError("DECK_TITLE_INVALID", "Deck title must be one non-empty Markdown-safe line")

    target = target.resolve()
    template = Path(__file__).resolve().parents[1] / "templates" / "workspace" / profile
    if not template.is_dir():
        raise WorkspaceError("TEMPLATE_MISSING", "Workspace profile template is missing", path=str(template))

    if target.exists() and not update:
        raise WorkspaceError("WORKSPACE_EXISTS", "Refusing to overwrite an existing workspace", path=str(target))
    if target.exists() and not target.is_dir():
        raise WorkspaceError("WORKSPACE_EXISTS", "Workspace target exists and is not a directory", path=str(target))
    if update:
        if not target.is_dir() or not (target / "workspace.json").is_file():
            raise WorkspaceError("UPDATE_TARGET_INVALID", "Update mode requires an initialized workspace", path=str(target))
        existing = load_json(target / "workspace.json")
        if existing.get("profile") != profile or existing.get("deck_name") != deck_name:
            raise WorkspaceError(
                "UPDATE_IDENTITY_MISMATCH",
                "Update mode cannot change the workspace profile or deck identity",
                path=str(target),
            )
    else:
        target.mkdir(parents=True)

    replacements = {
        "DECK_NAME": deck_name,
        "DECK_TITLE": deck_title,
        "PROFILE": profile,
    }
    created: list[str] = []
    preserved: list[str] = []
    for source in sorted(template.rglob("*"), key=lambda item: item.relative_to(template).as_posix()):
        relative = source.relative_to(template)
        destination = target / relative
        if source.is_dir():
            destination.mkdir(parents=True, exist_ok=True)
            continue
        if destination.exists():
            preserved.append(relative.as_posix())
            continue
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(_render_template(source.read_bytes(), replacements))
        shutil.copymode(source, destination)
        created.append(relative.as_posix())

    return {
        "status": "updated" if update else "initialized",
        "workspace": str(target),
        "profile": profile,
        "deck_name": deck_name,
        "created": created,
        "preserved": preserved,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("target", help="New workspace directory")
    parser.add_argument("--profile", choices=sorted(SUPPORTED_PROFILES), required=True)
    parser.add_argument("--deck-name", required=True, help="Stable lower-kebab deck identity")
    parser.add_argument("--deck-title", required=True)
    parser.add_argument(
        "--update",
        action="store_true",
        help="Create only missing template paths in a matching initialized workspace; never overwrite files",
    )
    args = parser.parse_args(argv)
    try:
        result = initialize_workspace(
            Path(args.target),
            args.profile,
            args.deck_name,
            args.deck_title,
            update=args.update,
        )
        code = 0
    except WorkspaceError as error:
        result = {"status": "blocked", "diagnostics": [error.diagnostic()]}
        code = 2
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    return code


if __name__ == "__main__":
    sys.exit(main())
