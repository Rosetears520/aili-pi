#!/usr/bin/env python3
"""Create, update, and validate project AGENTS.md files from the bundled AILI template."""

from __future__ import annotations

import argparse
import datetime as dt
import re
import shutil
import sys
from pathlib import Path


VERSION_RE = re.compile(r"<!--\s*AILI_AGENTS_TEMPLATE_VERSION:\s*(\d+)\s*-->")
SOURCE_MARKER = "<!-- AILI_AGENTS_TEMPLATE_SOURCE: templates/AGENTS.md -->"
MODE_MARKER = "<!-- AILI_AGENTS_TEMPLATE_MODE: generated-project-local-file -->"
BLOCK_RE = re.compile(
    r"<!-- AILI_MANAGED_BLOCK_BEGIN: (?P<name>[a-z0-9-]+) -->.*?"
    r"<!-- AILI_MANAGED_BLOCK_END: (?P=name) -->",
    re.DOTALL,
)
PLACEHOLDER_RE = re.compile(r"\bTODO\b|<!--\s*Fill\b|<!--\s*Add rules\b", re.IGNORECASE)

REQUIRED_SECTIONS = [
    "# AGENTS.md",
    "## Project Overview",
    "## Setup Commands",
    "## Architecture and Project Structure",
    "## Project-Specific Rules",
    "## Project-Specific Testing and Artifact Placement",
    "## Local Overrides",
]


def bundle_root() -> Path:
    return Path(__file__).resolve().parent


def template_path() -> Path:
    return bundle_root() / "agents-template.md"


def agents_path(project: Path) -> Path:
    return project.resolve() / "AGENTS.md"


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def write_text(path: Path, text: str) -> None:
    path.write_text(text, encoding="utf-8", newline="\n")


def backup(path: Path) -> Path:
    stamp = dt.datetime.now().strftime("%Y%m%d%H%M%S")
    backup_path = path.with_name(f"{path.name}.backup.{stamp}")
    shutil.copy2(path, backup_path)
    return backup_path


def managed_blocks(text: str) -> dict[str, str]:
    return {match.group("name"): match.group(0) for match in BLOCK_RE.finditer(text)}


def template_version(text: str) -> str | None:
    match = VERSION_RE.search(text)
    return match.group(1) if match else None


def replace_managed_blocks(target_text: str, template_text: str) -> tuple[str, list[str]]:
    target_blocks = managed_blocks(target_text)
    template_blocks = managed_blocks(template_text)
    missing = [name for name in template_blocks if name not in target_blocks]
    if missing:
        names = ", ".join(missing)
        raise SystemExit(f"AGENTS.md is missing managed block(s): {names}")

    updated = target_text
    replaced: list[str] = []
    for name, template_block in template_blocks.items():
        current_block = target_blocks[name]
        if current_block != template_block:
            updated = updated.replace(current_block, template_block)
            replaced.append(name)
    return updated, replaced


def command_init(args: argparse.Namespace) -> int:
    project = Path(args.project)
    destination = agents_path(project)
    template = read_text(template_path())

    if destination.exists():
        if args.strategy == "abort":
            print(f"AGENTS.md already exists: {destination}", file=sys.stderr)
            print("Use update, or rerun init with --strategy backup-overwrite.", file=sys.stderr)
            return 2
        backup_path = backup(destination)
        print(f"Backed up existing AGENTS.md to {backup_path}")

    write_text(destination, template)
    print(f"Created {destination} from {template_path()}")
    return 0


def command_update(args: argparse.Namespace) -> int:
    project = Path(args.project)
    destination = agents_path(project)
    if not destination.exists():
        print(f"AGENTS.md does not exist: {destination}", file=sys.stderr)
        print("Run init first.", file=sys.stderr)
        return 2

    current = read_text(destination)
    template = read_text(template_path())
    updated, replaced = replace_managed_blocks(current, template)
    if updated != current:
        backup_path = backup(destination)
        write_text(destination, updated)
        print(f"Backed up AGENTS.md to {backup_path}")
        print("Updated managed block(s): " + ", ".join(replaced))
    else:
        print("AGENTS.md managed blocks are already current.")
    return 0


def command_check(args: argparse.Namespace) -> int:
    project = Path(args.project)
    destination = agents_path(project)
    errors: list[str] = []

    if not destination.exists():
        print(f"FAIL: AGENTS.md does not exist: {destination}", file=sys.stderr)
        return 1

    text = read_text(destination)
    template = read_text(template_path())
    template_blocks = managed_blocks(template)
    target_blocks = managed_blocks(text)
    current_version = template_version(text)
    expected_version = template_version(template)

    if current_version is None:
        errors.append("missing AILI_AGENTS_TEMPLATE_VERSION marker")
    elif expected_version is None:
        errors.append("template missing AILI_AGENTS_TEMPLATE_VERSION marker")
    elif current_version != expected_version:
        errors.append(f"template version mismatch: AGENTS.md has {current_version}, template has {expected_version}")
    if SOURCE_MARKER not in text:
        errors.append("missing AILI_AGENTS_TEMPLATE_SOURCE marker")
    if MODE_MARKER not in text:
        errors.append("missing AILI_AGENTS_TEMPLATE_MODE marker")

    for section in REQUIRED_SECTIONS:
        if section not in text:
            errors.append(f"missing required section: {section}")

    for name, block in template_blocks.items():
        if name not in target_blocks:
            errors.append(f"missing managed block: {name}")
        elif target_blocks[name] != block:
            errors.append(f"managed block differs from template: {name}")
    for name in sorted(target_blocks.keys() - template_blocks.keys()):
        errors.append(f"stale managed block not present in template: {name}")

    if not args.allow_placeholders and PLACEHOLDER_RE.search(text):
        errors.append("unfilled placeholder remains; replace TODO/fill comments with project facts or 'unknown'")

    if errors:
        for error in errors:
            print(f"FAIL: {error}", file=sys.stderr)
        return 1

    print(f"PASS: {destination} follows {template_path()}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    init_parser = subparsers.add_parser("init", help="create AGENTS.md from the bundled AGENTS.md template")
    init_parser.add_argument("--project", default=".", help="project root directory")
    init_parser.add_argument(
        "--strategy",
        choices=["abort", "backup-overwrite"],
        default="abort",
        help="what to do when AGENTS.md already exists",
    )
    init_parser.set_defaults(func=command_init)

    update_parser = subparsers.add_parser("update", help="update template-managed blocks only")
    update_parser.add_argument("--project", default=".", help="project root directory")
    update_parser.set_defaults(func=command_update)

    check_parser = subparsers.add_parser("check", help="validate AGENTS.md template markers and managed blocks")
    check_parser.add_argument("--project", default=".", help="project root directory")
    check_parser.add_argument(
        "--allow-placeholders",
        action="store_true",
        help="allow TODO/fill placeholders; intended for template or freshly initialized draft checks only",
    )
    check_parser.set_defaults(func=command_check)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
